-- ============================================================
-- PRIVACY BACKEND — Supabase Setup
-- Cole esse SQL no SQL Editor do seu projeto Supabase
-- ============================================================

-- 1. TABELA DE MÍDIAS
-- Aqui você cadastra os vídeos/fotos via URL pública
CREATE TABLE IF NOT EXISTS public.medias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT,
  url         TEXT NOT NULL,           -- URL pública do vídeo/foto
  thumbnail   TEXT,                    -- URL do thumbnail (opcional)
  type        TEXT NOT NULL            -- 'photo' | 'video' | 'paid'
                CHECK (type IN ('photo','video','paid')),
  is_free     BOOLEAN DEFAULT FALSE,   -- TRUE = visível sem pagamento
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABELA DE TOKENS DE ACESSO
-- Gerada automaticamente após confirmação do PIX
CREATE TABLE IF NOT EXISTS public.access_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token        TEXT UNIQUE NOT NULL,   -- token enviado pro lead via URL
  payment_id   TEXT,                   -- ID do pagamento (gateway)
  payer_email  TEXT,
  payer_name   TEXT,
  amount       NUMERIC(10,2),
  expires_at   TIMESTAMPTZ NOT NULL,   -- expiração (ex: 365 dias)
  used_at      TIMESTAMPTZ,            -- quando foi usado pela 1ª vez
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ROW LEVEL SECURITY
ALTER TABLE public.medias        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_tokens ENABLE ROW LEVEL SECURITY;

-- Mídias: qualquer um pode ler (o controle é feito no frontend/function)
CREATE POLICY "Medias são públicas" ON public.medias
  FOR SELECT USING (true);

-- Tokens: somente service_role pode inserir/ler (via Netlify Functions)
CREATE POLICY "Somente service_role insere tokens" ON public.access_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- 4. EXEMPLOS DE MÍDIA (substitua pelas suas URLs reais)
INSERT INTO public.medias (title, url, thumbnail, type, is_free) VALUES
  ('Preview 1',  'https://seucdn.com/thumb1.jpg',  NULL,                              'photo', TRUE),
  ('Preview 2',  'https://seucdn.com/thumb2.jpg',  NULL,                              'photo', TRUE),
  ('Vídeo 1',    'https://seucdn.com/video1.mp4',  'https://seucdn.com/thumb_v1.jpg', 'video', FALSE),
  ('Vídeo 2',    'https://seucdn.com/video2.mp4',  'https://seucdn.com/thumb_v2.jpg', 'video', FALSE),
  ('Pack Pago 1','https://seucdn.com/paid1.mp4',   'https://seucdn.com/thumb_p1.jpg', 'paid',  FALSE),
  ('Pack Pago 2','https://seucdn.com/paid2.mp4',   'https://seucdn.com/thumb_p2.jpg', 'paid',  FALSE);

-- 5. TABELA DE CONFIGURAÇÕES DO SITE (perfil, planos, etc)
CREATE TABLE IF NOT EXISTS public.site_config (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;

-- Leitura pública (frontend usa para carregar config)
CREATE POLICY "Config é pública" ON public.site_config
  FOR SELECT USING (true);

-- Escrita somente pelo service_role (via Netlify Functions)
-- IMPORTANTE: separar INSERT e UPDATE é necessário para o upsert funcionar
CREATE POLICY "service_role insere config" ON public.site_config
  FOR INSERT WITH CHECK (true);

CREATE POLICY "service_role atualiza config" ON public.site_config
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "service_role deleta config" ON public.site_config
  FOR DELETE USING (true);

-- Config padrão do perfil
-- ON CONFLICT DO UPDATE garante que o row seja atualizado se já existir
INSERT INTO public.site_config (key, value) VALUES (
  'profile',
  '{
    "name": "Larissa Vitoria",
    "handle": "@larivictoria",
    "bio": "Mae solteira, safada e sem vergonha, do jeitinho que você gosta. 😈🔥 Adoro provocar, explorar todos os seus desejos e te deixar louco de tesão. Aqui, você encontra conteúdos sem censura e vídeos bem explícitos",
    "telegram": "https://t.me/maesolteiravipbot",
    "stats_fotos": "312",
    "stats_videos": "249",
    "stats_exclusivos": "8",
    "stats_likes": "19.2K",
    "stats_postagens": "284",
    "stats_midias": "561",
    "plan_1m_price": "27,90",
    "plan_3m_price": "37,90",
    "plan_3m_off": "35",
    "plan_12m_price": "87,90",
    "plan_12m_off": "80"
  }'
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  WHERE site_config.value = '{}';
-- (só sobrescreve se ainda for o valor vazio — preserva config já salva)


-- ============================================================
-- ATUALIZAÇÃO: vincula o token de pagamento ao usuário cadastrado
-- Cole esse bloco no SQL Editor do Supabase se já rodou o setup anterior
-- ============================================================
ALTER TABLE public.access_tokens ADD COLUMN IF NOT EXISTS user_id UUID;

-- Adiciona coluna model_id na tabela medias
ALTER TABLE public.medias ADD COLUMN IF NOT EXISTS model_id TEXT;

-- Índice para acelerar buscas por modelo
CREATE INDEX IF NOT EXISTS idx_medias_model_id ON public.medias (model_id);

-- (Opcional) Se quiser que mídias antigas fiquem vinculadas a um modelo padrão:
-- UPDATE public.medias SET model_id = 'modelo_a' WHERE model_id IS NULL;
