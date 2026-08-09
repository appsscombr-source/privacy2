// functions/api/member-content.js
// Usado pela members.html: recebe o JWT do usuário logado (Supabase Auth),
// confere se ele tem um access_token válido vinculado ao user_id, e só então
// devolve as mídias pagas. Isso evita que o conteúdo pago seja lido direto
// via REST do Supabase por qualquer pessoa autenticada.

import { createClient } from "../../lib/supabase.js";

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: HEADERS });

  const authHeader = request.headers.get("Authorization") || "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: HEADERS });
  }

  // Valida o JWT do usuário direto no Supabase Auth
  const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      "apikey": env.SUPABASE_SERVICE_KEY,
      "Authorization": `Bearer ${jwt}`,
    },
  });
  if (!authRes.ok) {
    return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: HEADERS });
  }
  const authUser = await authRes.json().catch(() => null);
  if (!authUser?.id) {
    return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: HEADERS });
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  // Verifica se este usuário tem um access_token válido (pagou)
  const { data: access, error: accessErr } = await supabase
    .from("access_tokens")
    .select("id, expires_at, payer_name")
    .eq("user_id", authUser.id)
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (accessErr) {
    return new Response(JSON.stringify({ error: "Erro ao consultar acesso" }), { status: 500, headers: HEADERS });
  }

  const hasAccess = !!access && new Date(access.expires_at) > new Date();

  if (!hasAccess) {
    return new Response(JSON.stringify({ ok: true, hasAccess: false, medias: [] }), { status: 200, headers: HEADERS });
  }

  const modelId = env.MODEL_ID;
  let query = supabase
    .from("medias")
    .select("id, title, url, thumbnail, type, is_free")
    .order("created_at", { ascending: false });
  if (modelId) query = query.eq("model_id", modelId);

  const { data: medias, error: mediaErr } = await query;
  if (mediaErr) {
    return new Response(JSON.stringify({ error: "Erro ao buscar mídias" }), { status: 500, headers: HEADERS });
  }

  return new Response(
    JSON.stringify({ ok: true, hasAccess: true, payerName: access.payer_name, medias }),
    { status: 200, headers: HEADERS }
  );
}
