-- ============================================================
-- MIGRAÇÃO: cadastro/login ANTES do pagamento
-- Cole no SQL Editor do Supabase (roda depois do setup.sql)
-- ============================================================

-- 1. Vincula o token de acesso a um usuário do Supabase Auth
ALTER TABLE public.access_tokens
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_access_tokens_user_id ON public.access_tokens (user_id);

-- 2. Tabela de "pagamentos pendentes"
-- Guarda qual usuário gerou qual cobrança, para o webhook conseguir
-- vincular o access_token ao user_id assim que o pagamento for confirmado.
CREATE TABLE IF NOT EXISTS public.pending_payments (
  identifier  TEXT PRIMARY KEY,       -- mesmo identifier retornado na criação do PIX
  user_id     UUID REFERENCES auth.users(id),
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pending_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Somente service_role acessa pending_payments" ON public.pending_payments
  FOR ALL USING (auth.role() = 'service_role');

-- 3. Aperta a segurança de public.medias
-- Antes: qualquer um podia ler tudo via REST (mesmo pago).
-- Agora: só o conteúdo gratuito (is_free = true) é público;
-- o conteúdo pago só é lido pelo service_role, através do endpoint
-- /api/member-content (que confere se o usuário realmente pagou).
DROP POLICY IF EXISTS "Medias são públicas" ON public.medias;
DROP POLICY IF EXISTS "Mídias gratuitas são públicas" ON public.medias;

CREATE POLICY "Mídias gratuitas são públicas" ON public.medias
  FOR SELECT USING (is_free = true OR auth.role() = 'service_role');
