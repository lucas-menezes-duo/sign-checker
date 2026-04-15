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
        const response = await client.messages.create({
          model: 'claude-opus-4-5',
          max_tokens: 512,
          system: [
            {
              type: 'text',
              text: 'Você é um perito em análise grafotécnica. Sua tarefa é comparar duas assinaturas com critério técnico rigoroso. Retorne APENAS um JSON válido, sem markdown, sem blocos de código, sem texto extra.',
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: session.mimeType, data: session.cnh },
                },
                {
                  type: 'image',
                  source: { type: 'base64', media_type: 'image/png', data: msg.data },
                },
                {
                  type: 'text',
                  text: `Você é um perito em análise grafotécnica. Compare as duas imagens de assinatura com critério técnico rigoroso.

Avalie os seguintes aspectos:
1. Completude: a assinatura do cliente contém todos os elementos presentes na assinatura da CNH? Se a assinatura da CNH tiver sobrenome e a do cliente não tiver, isso é uma diferença grave.
2. Estilo gráfico: inclinação, pressão, fluidez e forma das letras
3. Proporções: tamanho relativo das letras e elementos
4. Elementos característicos: traços, rubricas, ou elementos únicos presentes em ambas

Seja rigoroso: uma assinatura incompleta (faltando partes do nome que aparecem na CNH) deve ter score máximo de 40, independente da similaridade do estilo.

Retorne APENAS um JSON (sem markdown, sem texto extra) com os campos:
- score: número de 0 a 100 indicando similaridade (considere 70 como mínimo para aprovação)
- approved: boolean, true somente se score >= 70
- message: string em português explicando o resultado em 1 frase, mencionando especificamente o que está faltando ou diferente`,
                },
              ],
            },
          ],
        });

        const block = response.content[0];
        if (block.type !== 'text') throw new Error('Resposta inesperada da API.');

        const raw = block.text.trim()
          .replace(/^```(?:json)?\n?/i, '')
          .replace(/\n?```$/i, '');
        const result = JSON.parse(raw);

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
