// supabase/functions/get-content/index.ts
// Valida token de acesso e retorna mídias desbloqueadas
// GET https://<project>.supabase.co/functions/v1/get-content?token=xxx

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response(JSON.stringify({ error: "Token ausente" }), { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Valida token
  const { data: accessToken, error: tokenError } = await supabase
    .from("access_tokens")
    .select("id, expires_at, used_at, payer_name")
    .eq("token", token)
    .maybeSingle();

  if (tokenError || !accessToken) {
    return new Response(JSON.stringify({ error: "Token inválido" }), { status: 403, headers: corsHeaders });
  }

  if (new Date(accessToken.expires_at) < new Date()) {
    return new Response(JSON.stringify({ error: "Token expirado" }), { status: 403, headers: corsHeaders });
  }

  // Marca como usado
  if (!accessToken.used_at) {
    await supabase.from("access_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", accessToken.id);
  }

  // Busca mídias
  const { data: medias, error: mediaError } = await supabase
    .from("medias")
    .select("id, title, url, thumbnail, type, is_free")
    .order("created_at", { ascending: false });

  if (mediaError) {
    return new Response(JSON.stringify({ error: "Erro ao buscar mídias" }), { status: 500, headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ ok: true, payerName: accessToken.payer_name, medias }),
    { headers: corsHeaders }
  );
});
