# Setup — Privacy (Supabase + Netlify estático)

## Arquitetura nova

```
Netlify          → apenas hospeda os arquivos HTML/CSS/JS (gratuito)
Supabase         → banco de dados, autenticação admin, Edge Functions
                   NENHUMA variável de ambiente no Netlify
```

Tudo que era Netlify Functions agora é **Supabase Edge Functions**.  
Todas as chaves de gateway ficam **dentro do Supabase** (tabela `site_config`).

---

## Passo 1 — Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) → **New project**
2. Guarde os dados que aparecem em **Project Settings → API**:
   - `Project URL` → ex: `https://xyzxyz.supabase.co`
   - `anon / public` key → começa com `eyJ...`
   - `service_role` key → começa com `eyJ...` (guarde em local seguro, não vai no código)

---

## Passo 2 — Rodar o SQL de setup

1. Supabase → **SQL Editor** → **New query**
2. Cole o conteúdo de `supabase/setup.sql` e clique **Run**
3. Isso cria as tabelas, políticas RLS e dados iniciais

---

## Passo 3 — Criar usuário admin

1. Supabase → **Authentication → Users → Add user**
2. Email: `admin@seusite.com` (pode ser qualquer e-mail)
3. Password: escolha uma senha forte
4. Marque **Auto Confirm User**

> Esse usuário é o único que consegue salvar dados pelo painel admin.

---

## Passo 4 — Deploy das Edge Functions

Instale o Supabase CLI e faça login:

```bash
npm install -g supabase
supabase login
supabase link --project-ref SEUPROJETO  # o ID do seu projeto
```

Deploy das functions:

```bash
supabase functions deploy get-content
supabase functions deploy create-token
supabase functions deploy pix-webhook
supabase functions deploy syncpay-cashin
```

Verifique em: Supabase → **Edge Functions** — as 4 devem aparecer como "Active".

---

## Passo 5 — Editar as 3 constantes no código

Abra os arquivos e substitua os placeholders:

### `admin.html` (linha ~633)
```js
const SUPABASE_URL  = 'https://SEUPROJETO.supabase.co';   // ← sua URL
const SUPABASE_ANON = 'eyJhbGciOiJIUzI...';               // ← anon key
```

### `index.html` (linha ~2499)
```js
var SUPABASE_URL  = 'https://SEUPROJETO.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI...';
```

### `content-unlock.js` (linha ~7)
```js
const SUPABASE_URL = 'https://SEUPROJETO.supabase.co';
```

> A `anon key` é **pública** — pode ficar no código frontend sem problema.  
> A `service_role key` **nunca vai no código** — só é usada dentro das Edge Functions.

---

## Passo 6 — Deploy no Netlify

1. Netlify → **Add new site → Import an existing project**
2. Conecte ao GitHub/GitLab com o repositório do projeto  
   **ou** use drag-and-drop da pasta inteira
3. Build command: deixe **vazio**
4. Publish directory: `.` (ponto — raiz)
5. **Sem nenhuma variável de ambiente** no Netlify

---

## Passo 7 — Configurar gateway no painel admin

1. Abra `admin.html` no navegador
2. Login com o e-mail/senha do passo 3
3. Aba **Perfil** → preencha nome, foto, banner, planos → **Salvar tudo**
4. Na seção **Gateway PIX** → escolha o gateway → cole as chaves → **Salvar tudo**

As chaves de gateway ficam na tabela `site_config` key `gateway_config` — nunca em `.env`.

---

## URL do webhook PIX

Configure no painel do seu gateway:

```
https://SEUPROJETO.supabase.co/functions/v1/pix-webhook
```

---

## Verificando se funciona

Abra o Console do navegador (F12) em `index.html`:
- Sem erros → config carregando normalmente
- `404` ou `401` → verifique a URL e anon key nos arquivos

No painel admin, após salvar:
- Abre `index.html` → nome/foto devem atualizar imediatamente

---

## Estrutura final de arquivos

```
/
├── index.html           ← página principal (usa SUPABASE_URL + ANON)
├── admin.html           ← painel admin (login via Supabase Auth)
├── content-unlock.js    ← validação de token (chama Edge Function)
├── responsive.css
├── netlify.toml         ← só "publish = '.'"
├── fonts/
├── images/
├── js/
└── supabase/
    ├── setup.sql        ← rode uma vez no SQL Editor
    └── functions/
        ├── get-content/
        ├── create-token/
        ├── pix-webhook/
        └── syncpay-cashin/
```
