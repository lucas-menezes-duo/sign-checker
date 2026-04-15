import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { randomBytes } from 'crypto';

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json());

/* ── In-memory sessions ─────────────────────────────────────────
   sessionId → { cnh, mimeType, clients: Set<WebSocket>,
                 status: 'waiting'|'processing'|'complete', result }
   ─────────────────────────────────────────────────────────────── */
const sessions = new Map();

function generateSessionId() {
  return randomBytes(3).toString('hex').toUpperCase(); // e.g. "A3F9C1"
}

/* ── REST endpoints ── */

app.post(
  '/api/session/create',
  upload.fields([{ name: 'cnh', maxCount: 1 }]),
  (req, res) => {
    const cnhFile = req.files?.['cnh']?.[0];
    if (!cnhFile) {
      return res.status(400).json({ error: 'Imagem da CNH é necessária.' });
    }
    const sessionId = generateSessionId();
    sessions.set(sessionId, {
      cnh:      cnhFile.buffer.toString('base64'),
      mimeType: cnhFile.mimetype,
      clients:  new Set(),
      status:   'waiting',
      result:   null,
    });
    return res.json({ sessionId });
  }
);

app.get('/api/session/:id', (req, res) => {
  const session = sessions.get(req.params.id.toUpperCase());
  if (!session) return res.json({ exists: false });
  return res.json({ exists: true, status: session.status });
});

/* ── HTTP + WebSocket servers ── */

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let currentSessionId = null;

  ws.on('message', async (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Mensagem inválida.' }));
      return;
    }

    /* ── join: register client in a session ── */
    if (msg.type === 'join') {
      const sid = msg.sessionId?.toUpperCase();
      const session = sessions.get(sid);
      if (!session) {
        ws.send(JSON.stringify({ type: 'error', message: 'Sessão não encontrada.' }));
        return;
      }
      currentSessionId = sid;
      session.clients.add(ws);
      // If result already exists, send it immediately to the late-joining client
      if (session.result) {
        ws.send(JSON.stringify({ type: 'result', ...session.result }));
      }
      return;
    }

    /* ── signature: run comparison via Claude ── */
    if (msg.type === 'signature') {
      const sid = msg.sessionId?.toUpperCase();
      const session = sessions.get(sid);
      if (!session) {
        ws.send(JSON.stringify({ type: 'error', message: 'Sessão não encontrada.' }));
        return;
      }
      if (session.status === 'processing') {
        ws.send(JSON.stringify({ type: 'error', message: 'Processamento já em andamento.' }));
        return;
      }

      session.status = 'processing';
      broadcast(session, { type: 'processing' });

      try {
        const result = await compareSignatures(session.cnh, session.mimeType, msg.data);
        session.status = 'complete';
        session.result = result;
        broadcast(session, { type: 'result', ...result });
      } catch (err) {
        console.error('Erro na comparação:', err);
        session.status = 'waiting';
        broadcast(session, { type: 'error', message: 'Erro ao processar as imagens.' });
      }
      return;
    }
  });

  ws.on('close', () => {
    if (currentSessionId) {
      sessions.get(currentSessionId)?.clients.delete(ws);
    }
  });
});

/* ── Helpers ────────────────────────────────────────────────────── */

function normalizeWords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-záàâãéèêíïóôõöúüçñ\s]/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function parseJson(text) {
  const raw = text.trim()
    .replace(/^```(?:json)?\n?/i, '')
    .replace(/\n?```$/i, '');
  return JSON.parse(raw);
}

async function ocrImage(base64, mimeType, prompt) {
  const res = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 64,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: prompt },
      ],
    }],
  });
  return res.content[0]?.text?.trim() ?? '';
}

/* ── Hybrid comparison: classify → optional text check → graphic ── */

async function compareSignatures(cnhBase64, cnhMimeType, sigBase64) {

  /* ETAPA 1 — Classificação da assinatura da CNH */
  const classifyRes = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 128,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: cnhMimeType, data: cnhBase64 } },
        {
          type: 'text',
          text: "Analise a assinatura nesta CNH. Ela contém texto legível (letras ou palavras identificáveis) ou é predominantemente gráfica (rabisco, rubrica, traços abstratos)? Retorne APENAS um JSON com: type ('text' ou 'graphic'), words (array com as palavras encontradas em lowercase, ou array vazio se gráfica)",
        },
      ],
    }],
  });

  const classification = parseJson(classifyRes.content[0].text);
  const cnhWords = (classification.words ?? [])
    .map(w => w.toLowerCase().replace(/[^a-záàâãéèêíïóôõöúüçñ]/gi, '').trim())
    .filter(Boolean);
  const isTextBased = classification.type === 'text' && cnhWords.length > 0;

  /* ETAPA 2 — Validação textual (somente se a CNH tem texto legível) */
  if (isTextBased) {
    const sigText  = await ocrImage(
      sigBase64, 'image/png',
      'Extraia apenas o texto escrito nesta imagem de assinatura. ' +
      'Retorne APENAS as palavras visíveis, sem pontuação, em letras minúsculas, separadas por espaço. Nada mais.'
    );
    const sigWords = normalizeWords(sigText);
    const missing  = cnhWords.filter(w => !sigWords.includes(w));

    if (missing.length > 0) {
      return {
        score:    20,
        approved: false,
        message:  `Assinatura incompleta: as seguintes partes estão faltando: ${missing.join(', ')}`,
      };
    }
  }

  /* ETAPA 3 — Validação gráfica (sempre executada se chegou aqui) */
  const res = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: cnhMimeType, data: cnhBase64 } },
        { type: 'image', source: { type: 'base64', media_type: 'image/png',  data: sigBase64 } },
        {
          type: 'text',
          text: 'Você é um perito grafotécnico. Compare o estilo gráfico das duas assinaturas: ' +
                'inclinação, fluidez, forma, proporções e traços característicos. ' +
                'Retorne APENAS um JSON com: score (0-100), approved (true se score >= 70), ' +
                'message (string em português em 1 frase explicando o resultado)',
        },
      ],
    }],
  });

  const block = res.content[0];
  if (block.type !== 'text') throw new Error('Resposta inesperada da API.');
  return parseJson(block.text);
}

function broadcast(session, msg) {
  const data = JSON.stringify(msg);
  for (const ws of session.clients) {
    if (ws.readyState === 1 /* OPEN */) ws.send(data);
  }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
