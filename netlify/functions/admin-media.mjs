// netlify/functions/admin-media.mjs
const HEADERS = { "Content-Type": "application/json" };

function sbFetch(url, key, path, options = {}) {
  return fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": key, "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json", "Prefer": "return=representation",
      ...(options.headers || {}),
    },
  });
}

export default async function handler(req) {
  const env     = process.env;
  const secret  = req.headers.get("x-admin-secret") || new URL(req.url).searchParams.get("secret");
  if (secret !== env.ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: HEADERS });
  }

  const modelId = env.MODEL_ID;
  if (!modelId) {
    return new Response(JSON.stringify({ error: "MODEL_ID não configurado" }), { status: 500, headers: HEADERS });
  }

  const SUPABASE_URL = env.SUPABASE_URL;
  const SERVICE_KEY  = env.SUPABASE_SERVICE_KEY;

  if (req.method === "GET") {
    const res  = await sbFetch(SUPABASE_URL, SERVICE_KEY, `medias?model_id=eq.${encodeURIComponent(modelId)}&order=created_at.desc`);
    const data = await res.json();
    return new Response(JSON.stringify(data), { status: res.ok ? 200 : 500, headers: HEADERS });
  }

  if (req.method === "POST") {
    let body; try { body = await req.json(); } catch { return new Response('{"error":"JSON inválido"}', { status: 400, headers: HEADERS }); }
    const { url: mediaUrl, thumbnail, type, title, is_free } = body;
    if (!mediaUrl || !type) return new Response(JSON.stringify({ error: "url e type obrigatórios" }), { status: 400, headers: HEADERS });
    const res  = await sbFetch(SUPABASE_URL, SERVICE_KEY, "medias", {
      method: "POST", body: JSON.stringify({ url: mediaUrl, thumbnail: thumbnail || null, type, title: title || null, is_free: !!is_free, model_id: modelId }),
    });
    const data = await res.json();
    return new Response(JSON.stringify(Array.isArray(data) ? data[0] : data), { status: res.ok ? 201 : 500, headers: HEADERS });
  }

  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return new Response('{"error":"id ausente"}', { status: 400, headers: HEADERS });
    const res = await sbFetch(SUPABASE_URL, SERVICE_KEY, `medias?id=eq.${encodeURIComponent(id)}&model_id=eq.${encodeURIComponent(modelId)}`, { method: "DELETE" });
    return new Response(JSON.stringify({ deleted: res.ok }), { status: res.ok ? 200 : 500, headers: HEADERS });
  }

  return new Response("Method Not Allowed", { status: 405 });
}

export const config = { path: "/api/admin-media" };
