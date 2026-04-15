# Sign Checker — Verificador de Assinaturas

Aplicação fullstack que compara a assinatura de uma CNH com a assinatura coletada digitalmente, utilizando a API de visão do Claude (Anthropic) para análise forense.

## Arquitetura

```
sign-checker/
├── backend/    # Node.js + Express + WebSocket (ws) + @anthropic-ai/sdk
└── frontend/   # React + Vite + react-router-dom + signature_pad + qrcode.react
```

### Fluxo de uso
1. **Atendente** (`/`) faz upload da assinatura da CNH e cria uma sessão — recebe um código de 6 caracteres e um QR Code.
2. **Cliente** (`/client?session=XXX`) acessa o link/QR Code, assina na tela e envia.
3. O backend compara as duas assinaturas via Claude Vision e transmite o resultado em tempo real via **WebSocket** para os dois participantes.

---

## Como rodar localmente

### Pré-requisitos
- Node.js 20.19+ ou 22+
- Chave de API da Anthropic ([console.anthropic.com](https://console.anthropic.com))

### 1. Backend

```bash
cd backend
npm install
```

Crie `.env`:
```
ANTHROPIC_API_KEY=sua_chave_aqui
```

Inicie:
```bash
npm run dev
# http://localhost:3001
```

### 2. Frontend

```bash
cd frontend
npm install
```

Crie `.env.local` (opcional):
```
VITE_API_URL=http://localhost:3001
VITE_APP_URL=http://localhost:5173
```

Inicie:
```bash
npm run dev
# http://localhost:5173
```

Acesse `http://localhost:5173` como atendente e `http://localhost:5173/client?session=CÓDIGO` como cliente.

---

## Deploy no Render (backend)

1. Acesse [render.com](https://render.com) → **New → Web Service**.
2. Conecte o repositório e configure:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
3. Em **Environment Variables**, adicione:

   | Chave | Valor |
   |-------|-------|
   | `ANTHROPIC_API_KEY` | sua chave da Anthropic |

4. Clique em **Create Web Service** e copie a URL gerada (ex.: `https://sign-checker-api.onrender.com`).

> `PORT` é injetado automaticamente pelo Render.

---

## Deploy na Vercel (frontend)

1. Acesse [vercel.com](https://vercel.com) → **Add New → Project**.
2. Importe o repositório e configure:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (detectado automaticamente)
3. Em **Environment Variables**, adicione:

   | Chave | Valor |
   |-------|-------|
   | `VITE_API_URL` | URL do backend no Render (ex.: `https://sign-checker-api.onrender.com`) |
   | `VITE_APP_URL` | URL do frontend na Vercel (ex.: `https://sign-checker.vercel.app`) |

4. Clique em **Deploy**.

---

## Variáveis de ambiente

| Variável | Onde | Descrição |
|----------|------|-----------|
| `ANTHROPIC_API_KEY` | Backend | Chave de API da Anthropic |
| `PORT` | Backend | Porta do servidor (injetada pelo Render) |
| `VITE_API_URL` | Frontend | URL base do backend, sem barra final |
| `VITE_APP_URL` | Frontend | URL base do frontend (usada no QR Code) |
