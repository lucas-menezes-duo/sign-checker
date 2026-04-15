import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json());

app.post(
  '/api/compare',
  upload.fields([{ name: 'cnh', maxCount: 1 }, { name: 'signature', maxCount: 1 }]),
  async (req, res) => {
    try {
      const cnhFile = req.files?.['cnh']?.[0];
      const signatureFile = req.files?.['signature']?.[0];

      if (!cnhFile || !signatureFile) {
        return res.status(400).json({ error: 'Ambas as imagens são necessárias (cnh e signature).' });
      }

      const cnhBase64 = cnhFile.buffer.toString('base64');
      const signatureBase64 = signatureFile.buffer.toString('base64');

      const response = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 512,
        system: [
          {
            type: 'text',
            text: 'Você é um especialista em análise forense de assinaturas. Sua tarefa é comparar duas assinaturas e avaliar o grau de similaridade entre elas. Retorne APENAS um JSON válido, sem markdown, sem blocos de código, sem texto extra.',
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: cnhFile.mimetype,
                  data: cnhBase64,
                },
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: signatureFile.mimetype,
                  data: signatureBase64,
                },
              },
              {
                type: 'text',
                text: 'analise as duas imagens de assinatura e retorne APENAS um JSON (sem markdown, sem texto extra) com os campos: score (número de 0 a 100 indicando similaridade), approved (boolean, true se score >= 60), message (string em português explicando o resultado em 1 frase)',
              },
            ],
          },
        ],
      });

      const block = response.content[0];

      if (block.type !== 'text') {
        return res.status(500).json({ error: 'Resposta inesperada da API.' });
      }

      const raw = block.text.trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
      const result = JSON.parse(raw);
      return res.json(result);
    } catch (err) {
      console.error('Erro ao processar comparação:', err);

      if (err instanceof SyntaxError) {
        return res.status(500).json({ error: 'A API retornou uma resposta inválida.' });
      }

      return res.status(500).json({ error: 'Erro interno ao processar as imagens.' });
    }
  }
);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
