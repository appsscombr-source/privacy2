// netlify/functions/get-content.mjs
function sbFetch(url, key, path, options = {}) {
  return fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
}

export default async function handler(req) {
  const env          = process.env;
  const SUPABASE_URL = env.SUPABASE_URL;
  const SERVICE_KEY  = env.SUPABASE_SERVICE_KEY;
  const CORS_HEADERS = {
    "Access-Control-Allow-Origin": env.SITE_URL || "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const token = new URL(req.url).searchParams.get("token");
  if (!token) return new Response(JSON.stringify({ error: "Token ausente" }), { status: 400, headers: CORS_HEADERS });

  const tokenRes  = await sbFetch(SUPABASE_URL, SERVICE_KEY, `access_tokens?token=eq.${encodeURIComponent(token)}&select=id,expires_at,used_at,payer_name&limit=1`);
  const tokenData = await tokenRes.json();
  const access    = tokenData[0];
  if (!access) return new Response(JSON.stringify({ error: "Token inválido" }), { status: 403, headers: CORS_HEADERS });
  if (new Date(access.expires_at) < new Date()) return new Response(JSON.stringify({ error: "Token expirado" }), { status: 403, headers: CORS_HEADERS });

  if (!access.used_at) {
    await sbFetch(SUPABASE_URL, SERVICE_KEY, `access_tokens?id=eq.${access.id}`, {
      method: "PATCH", body: JSON.stringify({ used_at: new Date().toISOString() }),
    });
  }

  const modelId = env.MODEL_ID;
  const modelFilter = modelId ? `&model_id=eq.${encodeURIComponent(modelId)}` : "";
  const mediaRes  = await sbFetch(SUPABASE_URL, SERVICE_KEY, `medias?select=id,title,url,thumbnail,type,is_free&order=created_at.desc${modelFilter}`);
  const medias    = await mediaRes.json();

  return new Response(JSON.stringify({ ok: true, payerName: access.payer_name, medias }), { status: 200, headers: CORS_HEADERS });
}

export const config = { path: "/api/get-content" };
