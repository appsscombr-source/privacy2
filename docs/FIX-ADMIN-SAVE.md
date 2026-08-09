# Fix: Admin não salva perfil na página principal

## Causa raiz

Dois problemas simultâneos impediam o save de funcionar:

---

## Problema 1 — `SUPABASE_SERVICE_KEY` incorreta no `.env`

A `SUPABASE_SERVICE_KEY` do seu `.env` começa com `sb_secret_...`.  
Isso **não é** a `service_role key` do Supabase. A key legítima começa com `eyJ` (é um JWT).

Com a key errada, o cliente Supabase não consegue escrever na tabela — o RLS bloqueia silenciosamente.

### Como corrigir:
1. Acesse [supabase.com](https://supabase.com) → seu projeto
2. Vá em **Project Settings → API**
3. Copie a **`service_role` key** (começa com `eyJ...`)
4. No `.env` e nas variáveis de ambiente do Netlify, substitua:
   ```
   SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  ← key real
   ```
5. No Netlify: **Site Configuration → Environment Variables → edite `SUPABASE_SERVICE_KEY`**

---

## Problema 2 — Policies RLS bloqueando escrita

A policy antiga usava `FOR ALL USING (auth.role() = 'service_role')`, que não funciona
corretamente para operações de escrita separadas (INSERT vs UPDATE).

### Como corrigir:
Execute o SQL abaixo no **SQL Editor** do Supabase (substitui as policies antigas):

```sql
-- Remove policies antigas de escrita na site_config
DROP POLICY IF EXISTS "Somente service_role edita config" ON public.site_config;

-- Cria policies corretas separadas
CREATE POLICY "service_role insere config" ON public.site_config
  FOR INSERT WITH CHECK (true);

CREATE POLICY "service_role atualiza config" ON public.site_config
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "service_role deleta config" ON public.site_config
  FOR DELETE USING (true);
```

---

## Problema 3 — `upsert` falhava silenciosamente (corrigido no código)

O `upsert` do Supabase com `onConflict: "key"` às vezes falha sem retornar erro visível
quando a policy não está configurada corretamente.

**Já corrigido** em `netlify/functions/admin-profile.js`: agora faz SELECT → UPDATE ou INSERT
explicitamente, e loga o erro real no console do Netlify se falhar.

---

## Checklist final

- [ ] `SUPABASE_SERVICE_KEY` começa com `eyJ...` no Netlify Environment Variables
- [ ] SQL das policies executado no Supabase SQL Editor
- [ ] Redeploy feito no Netlify após alterar as env vars
- [ ] Testar: salvar no admin → abrir `index.html` → nome/foto atualizam

---

## Como verificar se o save está funcionando

Após salvar no admin, abra o **Console do navegador** (F12) na página do admin e veja se aparece:
- ✅ `Perfil salvo com sucesso!` → gravou no Supabase
- ❌ `Erro ao salvar: ...` → veja a mensagem de erro exata

Para ver logs do servidor: Netlify Dashboard → **Functions → admin-profile → Logs**
