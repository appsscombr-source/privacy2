# Configuração PIX — Supabase Edge Functions

Tudo roda no Supabase. Não é necessário nenhuma variável de ambiente de gateway no Netlify.
As credenciais são salvas pelo painel admin direto na tabela `site_config`.

---

## Variáveis de ambiente do Supabase (automáticas)

O Supabase já injeta automaticamente nas Edge Functions:

| Variável | Descrição |
|---|---|
| `SUPABASE_URL` | URL do projeto (injetada automaticamente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (injetada automaticamente) |

Você **não precisa configurar nada** — o Supabase faz isso sozinho.

---

## Credenciais de gateway

Configure tudo pelo **painel admin** (`admin.html`):
- Selecione o gateway (SyncPayments, Asaas, EfiBank, Mercado Pago, PrimePag ou Genérico)
- Preencha as credenciais do gateway
- Clique em **Salvar**

Os dados ficam na tabela `site_config` com a chave `gateway_config` e são lidos
pelas Edge Functions em tempo de execução.

---

## Deploy das Edge Functions

```bash
# Instala o CLI do Supabase (se ainda não tiver)
npm install -g supabase

# Faz login
supabase login

# Linka ao projeto
supabase link --project-ref SEU_PROJECT_REF

# Deploy de todas as functions de uma vez
supabase functions deploy pix-cashin
supabase functions deploy pix-webhook
supabase functions deploy syncpay-cashin
supabase functions deploy get-content
supabase functions deploy create-token
```

---

## Webhook — registre no painel do gateway

```
https://SEU_PROJECT_REF.supabase.co/functions/v1/pix-webhook
```

> No SyncPayments: Painel → Developer API → Webhooks → evento `cashin`

---

## Fluxo completo

```
Usuário clica no plano (index.html)
  → Modal abre, preenche nome/email/CPF
  → pix-modal.js lê gateway_config do Supabase REST
  → POST /functions/v1/pix-cashin
  → Edge Function lê credenciais do gateway_config
  → Chama API do gateway → retorna pix_code + QR code
  → Usuário paga
  → Gateway dispara webhook → /functions/v1/pix-webhook
  → Token de acesso criado no Supabase
  → Usuário recebe link de acesso
```

---

## Netlify (hosting apenas)

O Netlify serve **somente os arquivos estáticos** (HTML/CSS/JS/imagens).
As únicas Netlify Functions que ainda existem são as de admin (`admin-profile.js`, `admin-media.js`)
que também podem ser migradas para Edge Functions futuramente se preferir.
