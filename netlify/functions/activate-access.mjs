// netlify/functions/activate-access.mjs
// Confirma o e-mail do usuário recém-cadastrado e vincula o token de pagamento
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Content-Type": "application/json" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: CORS });

  let body; try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: CORS }); }

  const { token, user_id, email } = body;
  if (!user_id) return new Response(JSON.stringify({ error: "user_id é obrigatório" }), { status: 422, headers: CORS });

  const env = process.env;
  const adminHeaders = {
    "Content-Type": "application/json",
    "apikey": env.SUPABASE_SERVICE_KEY,
    "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  };

  try {
    // 1) Confirma o e-mail do usuário automaticamente (sem isso o login falha)
    const confirmRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ email_confirm: true }),
    });
    if (!confirmRes.ok) {
      const errData = await confirmRes.json().catch(() => ({}));
      console.error("[activate-access] falha ao confirmar e-mail:", errData);
    }

    // 2) Vincula o token de pagamento ao usuário (best-effort)
    if (token) {
      await fetch(`${env.SUPABASE_URL}/rest/v1/access_tokens?token=eq.${encodeURIComponent(token)}`, {
        method: "PATCH",
        headers: { ...adminHeaders, "Prefer": "return=minimal" },
        body: JSON.stringify({ used_at: new Date().toISOString(), user_id, payer_email: email || null }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
  } catch (err) {
    console.error("[activate-access]", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
}

export const config = { path: "/api/activate-access" };
