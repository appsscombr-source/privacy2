// functions/api/get-content.js
import { createClient } from "../../lib/supabase.js";

export async function onRequest({ request, env }) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const headers = {
    "Access-Control-Allow-Origin": env.SITE_URL || "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response(JSON.stringify({ error: "Token ausente" }), { status: 400, headers });
  }

  const { data: accessToken, error: tokenError } = await supabase
    .from("access_tokens")
    .select("id, expires_at, used_at, payer_name")
    .eq("token", token)
    .maybeSingle();

  if (tokenError || !accessToken) {
    return new Response(JSON.stringify({ error: "Token inválido" }), { status: 403, headers });
  }

  if (new Date(accessToken.expires_at) < new Date()) {
    return new Response(JSON.stringify({ error: "Token expirado" }), { status: 403, headers });
  }

  if (!accessToken.used_at) {
    await supabase
      .from("access_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", accessToken.id);
  }

  // Filtra mídias pelo MODEL_ID da variável de ambiente
  const modelId = env.MODEL_ID;
  let query = supabase
    .from("medias")
    .select("id, title, url, thumbnail, type, is_free")
    .order("created_at", { ascending: false });

  if (modelId) {
    query = query.eq("model_id", modelId);
  }

  const { data: medias, error: mediaError } = await query;

  if (mediaError) {
    return new Response(JSON.stringify({ error: "Erro ao buscar mídias" }), { status: 500, headers });
  }

  return new Response(JSON.stringify({ ok: true, payerName: accessToken.payer_name, medias }), { status: 200, headers });
}
