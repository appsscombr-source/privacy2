# Migração para Cloudflare Pages

## O que mudou

| Antes (Netlify) | Depois (Cloudflare) |
|---|---|
| `netlify/functions/*.js` | `functions/api/*.js` |
| `exports.handler = async (event)` | `export async function onRequest({ request, env })` |
| `process.env.VARIAVEL` | `env.VARIAVEL` |
| `netlify.toml` | `_headers` + `_redirects` |
| `require("./gateways")` | `import { ... } from "../../lib/gateways.js"` |
| `crypto.randomBytes` (Node) | `crypto.getRandomValues` (Web Crypto API) |
| `Buffer.from(...).toString("base64")` | `btoa(...)` |

## Estrutura de pastas

```
/
├── functions/
│   └── api/
│       ├── admin-media.js
│       ├── admin-profile.js
│       ├── create-token.js
│       ├── get-content.js
│       ├── pix-cashin.js
│       ├── pix-webhook.js
│       └── syncpay-cashin.js
├── lib/
│   └── gateways.js
├── _headers
├── _redirects
├── package.json
├── index.html
├── admin.html
└── (demais arquivos estáticos)
```

## Como fazer o deploy

### 1. Copie os arquivos convertidos para o seu projeto

Copie as pastas `functions/` e `lib/` e os arquivos `_headers`, `_redirects` e `package.json`
para a raiz do seu projeto (junto com `index.html`, `admin.html` etc.).

Apague a pasta `netlify/` e o `netlify.toml` — não são mais necessários.

### 2. Crie o projeto no Cloudflare Pages

1. Acesse https://pages.cloudflare.com
2. Clique em **Create a project** → **Connect to Git**
3. Selecione seu repositório
4. Configure o build:
   - **Framework preset:** None
   - **Build command:** *(deixe em branco)*
   - **Build output directory:** `/` (ou `.`)

### 3. Configure as variáveis de ambiente

No painel do Cloudflare Pages → **Settings → Environment variables**, adicione:

| Variável | Valor |
|---|---|
| `SUPABASE_URL` | URL do seu projeto Supabase |
| `SUPABASE_SERVICE_KEY` | Service role key do Supabase |
| `ADMIN_SECRET` | Sua senha de admin |
| `SITE_URL` | URL do site (ex: https://seusite.pages.dev) |

### 4. Faça o deploy

Qualquer push para o repositório dispara um deploy automático.
No Cloudflare Pages free, deploys são **ilimitados** e a banda também.

## URLs das funções

As rotas continuam as mesmas — nada muda no frontend:

- `GET  /api/get-content?token=xxx`
- `POST /api/pix-cashin`
- `POST /api/pix-webhook`
- `GET  /api/create-token?secret=xxx&days=365`
- `GET/POST/DELETE /api/admin-media`
- `GET/POST /api/admin-profile`
- `POST /api/syncpay-cashin`
