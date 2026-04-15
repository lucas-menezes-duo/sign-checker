# Sign Checker — Verificador de Assinaturas

Aplicação fullstack que compara a assinatura de uma CNH com a assinatura coletada digitalmente, utilizando a API de visão do Claude (Anthropic) para análise forense. O resultado inclui uma pontuação de similaridade (0–100) e uma aprovação automática quando a similaridade atinge 60% ou mais.

## Estrutura do projeto

```
sign-checker/
├── backend/      # Node.js + Express + @anthropic-ai/sdk
└── frontend/     # React + Vite + signature_pad
```

---

## Como rodar localmente

### Pré-requisitos

- Node.js 20.19+ ou 22+
- Uma chave de API da Anthropic ([console.anthropic.com](https://console.anthropic.com))

### 1. Backend

```bash
cd backend
npm install
```

Crie o arquivo `.env`:

```
ANTHROPIC_API_KEY=sua_chave_aqui
```

Inicie o servidor:

```bash
npm run dev
# Servidor disponível em http://localhost:3001
```

### 2. Frontend

```bash
cd frontend
npm install
```

Crie o arquivo `.env.local` (opcional — se omitido, usa `http://localhost:3001` como padrão):

```
VITE_API_URL=http://localhost:3001
```

Inicie o servidor de desenvolvimento:

```bash
npm run dev
# App disponível em http://localhost:5173
```

---

## Deploy no Render (backend)

1. Crie uma conta em [render.com](https://render.com) e clique em **New → Web Service**.
2. Conecte o repositório Git e configure:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Environment:** Node
3. Na seção **Environment Variables**, adicione:
   | Chave | Valor |
   |-------|-------|
   | `ANTHROPIC_API_KEY` | sua chave da Anthropic |
4. Clique em **Create Web Service**.
5. Após o deploy, copie a URL gerada (ex.: `https://sign-checker-api.onrender.com`).

> A variável `PORT` é injetada automaticamente pelo Render — o servidor já está configurado para lê-la via `process.env.PORT`.

---

## Deploy na Vercel (frontend)

1. Crie uma conta em [vercel.com](https://vercel.com) e clique em **Add New → Project**.
2. Importe o repositório Git e configure:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (detectado automaticamente)
3. Na seção **Environment Variables**, adicione:
   | Chave | Valor |
   |-------|-------|
   | `VITE_API_URL` | URL do backend no Render (ex.: `https://sign-checker-api.onrender.com`) |
4. Clique em **Deploy**.

> Variáveis Vite precisam do prefixo `VITE_` para serem expostas ao bundle do navegador.

---

## Variáveis de ambiente

| Variável | Onde | Descrição |
|----------|------|-----------|
| `ANTHROPIC_API_KEY` | Backend | Chave de API da Anthropic |
| `PORT` | Backend | Porta do servidor (injetada automaticamente pelo Render) |
| `VITE_API_URL` | Frontend | URL base do backend (sem barra final) |
