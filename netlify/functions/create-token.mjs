// netlify/functions/create-token.mjs
function sbFetch(url, key, path, options = {}) {
  return fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "Prefer": "return=representation", ...(options.headers || {}) },
  });
}

export default async function handler(req) {
  const env    = process.env;
  const params = new URL(req.url).searchParams;
  if (params.get("secret") !== env.ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const days  = parseInt(params.get("days") || "36500");
  const label = params.get("label") || "acesso-manual";

  const arr = new Uint8Array(32); crypto.getRandomValues(arr);
  const token = Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + days);

  const res = await sbFetch(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, "access_tokens", {
    method: "POST",
    body: JSON.stringify({ token, payment_id: label, payer_name: label, expires_at: expiresAt.toISOString() }),
  });

  if (!res.ok) return new Response(JSON.stringify({ error: "Erro ao criar token" }), { status: 500, headers: { "Content-Type": "application/json" } });

  const siteUrl   = env.SITE_URL || "";
  const accessUrl = `${siteUrl}?token=${token}`;
  return new Response(JSON.stringify({ ok: true, token, accessUrl, expiresAt }), { status: 200, headers: { "Content-Type": "application/json" } });
}

export const config = { path: "/api/create-token" };
