// netlify/functions/activate-access.mjs
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Content-Type": "application/json" };

export async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: CORS });

  let body; try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: CORS }); }

  const { token, user_id, email } = body;
  if (!token || !user_id) return new Response(JSON.stringify({ error: "token e user_id obrigatórios" }), { status: 422, headers: CORS });

  const env = process.env;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/activate_member_access`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "apikey": env.SUPABASE_SERVICE_ROLE, "Authorization": `Bearer ${env.SUPABASE_SERVICE_ROLE}` },
    body: JSON.stringify({ p_user_id: user_id, p_token: token, p_email: email || null }),
  });
  const data = await res.json();
  if (!res.ok) return new Response(JSON.stringify({ error: data.message || "Erro ao ativar acesso" }), { status: 500, headers: CORS });
  return new Response(JSON.stringify(data), { status: 200, headers: CORS });
}

export const config = { path: "/api/activate-access" };
