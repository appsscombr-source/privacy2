# 🚀 Guia de Setup — Privacy Backend

## Visão Geral do Fluxo

```
Lead clica em "Assinar"
  → Paga PIX no gateway
    → Gateway envia webhook → /api/pix-webhook
      → Backend gera token único
        → Lead recebe link: seusite.com?token=abc123
          → Frontend valida token → libera vídeos
```

---

## PASSO 1 — Criar projeto no Supabase (gratuito)

1. Acesse https://supabase.com → "New project"
2. Anote a **Project URL** e a **Service Role Key** (em Settings → API)
3. Vá em **SQL Editor** e cole o conteúdo do arquivo `supabase/setup.sql`
4. Execute → tabelas criadas ✅

---

## PASSO 2 — Variáveis de Ambiente na Netlify

Vá em **Site Settings → Environment Variables** e adicione:

| Variável               | Valor                                      |
|------------------------|--------------------------------------------|
| `SUPABASE_URL`         | `https://xxxxx.supabase.co`                |
| `SUPABASE_SERVICE_KEY` | `eyJ...` (Service Role Key do Supabase)    |
| `SITE_URL`             | `https://seusite.netlify.app`              |
| `ADMIN_SECRET`         | Senha forte para o painel admin (você cria)|

---

## PASSO 3 — Estrutura de arquivos no repositório

Copie os arquivos para o seu repo assim:

```
seu-projeto/
├── index.html                        ← já existe
├── content-unlock.js                 ← arquivo novo
├── netlify.toml                      ← arquivo novo
├── package.json                      ← arquivo novo
└── netlify/
    └── functions/
        ├── pix-webhook.js            ← arquivo novo
        ├── get-content.js            ← arquivo novo
        └── admin-media.js            ← arquivo novo
```

---

## PASSO 4 — Adicionar script no index.html

Cole no final do `index.html`, antes de `</body>`:

```html
<script src="content-unlock.js"></script>
```

---

## PASSO 5 — Configurar o Gateway de Pagamento

### Asaas (recomendado para PIX)
1. Em Integrações → Webhooks → adicione:
   `https://seusite.netlify.app/api/pix-webhook`
2. Ative os eventos: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`

### EfiBank / Gerencianet
- URL do webhook: `https://seusite.netlify.app/api/pix-webhook`

### Mercado Pago
- URL de notificação: `https://seusite.netlify.app/api/pix-webhook`
- (MP requer buscar os detalhes na API deles, adicione sua `MP_ACCESS_TOKEN` nas env vars)

### PrimePag
- Webhook de retorno: `https://seusite.netlify.app/api/pix-webhook`

---

## PASSO 6 — Adicionar mídias (via API admin)

Após deploy, adicione seus vídeos/fotos assim:

```bash
# Adicionar um vídeo
curl -X POST https://seusite.netlify.app/api/admin-media?secret=SUA_SENHA \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://drive.google.com/uc?id=FILE_ID",
    "thumbnail": "https://seucdn.com/thumb.jpg",
    "type": "video",
    "title": "Vídeo exclusivo 1",
    "is_free": false
  }'

# Listar todas as mídias
curl "https://seusite.netlify.app/api/admin-media?secret=SUA_SENHA"

# Remover uma mídia
curl -X DELETE "https://seusite.netlify.app/api/admin-media?id=UUID&secret=SUA_SENHA"
```

**Tipos válidos:** `photo` | `video` | `paid`

---

## Onde hospedar os vídeos?

| Serviço        | Prós                              | Contras           |
|----------------|-----------------------------------|-------------------|
| **Bunny.net**  | Barato, CDN global, streaming     | Pago (centavos/GB)|
| **Cloudflare R2** | 10GB grátis, rápido            | Setup técnico     |
| **Google Drive** | Gratuito, fácil               | Pode ser bloqueado|
| **Backblaze B2** | $0.006/GB, muito barato       | Setup técnico     |

> Recomendação: **Bunny.net** para vídeos (R$5~10/mês para começo).

---

## Testando localmente

```bash
npm install -g netlify-cli
npm install
netlify dev
```

Acesse: `http://localhost:8888`

Para simular um acesso liberado, gere um token manualmente no Supabase:

```sql
INSERT INTO access_tokens (token, expires_at)
VALUES ('teste123', NOW() + INTERVAL '1 year');
```

Depois acesse: `http://localhost:8888?token=teste123`

---

## Como o lead recebe o link?

O webhook gera o token automaticamente. Você precisa **enviar o link** ao lead:

**Opção A — WhatsApp via Twilio/Z-API** (adicione no `pix-webhook.js`):
```js
await fetch("https://api.z-api.io/instances/SEU_ID/send-text", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Client-Token": "SEU_TOKEN" },
  body: JSON.stringify({
    phone: parsed.payerPhone,
    message: `✅ Pagamento confirmado! Acesse seu conteúdo: ${accessUrl}`
  })
});
```

**Opção B — Email via Resend** (gratuito até 3000 emails/mês):
```js
await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.RESEND_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    from: "no-reply@seudominio.com",
    to: parsed.payerEmail,
    subject: "Seu acesso foi liberado! 🎉",
    html: `<p>Clique aqui para acessar: <a href="${accessUrl}">${accessUrl}</a></p>`
  })
});
```
