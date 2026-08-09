// functions/api/activate-access.js
// Confirma o e-mail do usuário recém-cadastrado e vincula o token de pagamento

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: CORS });

  let body = {};
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: CORS });
  }

  const { token, user_id, email } = body;
  if (!user_id) {
    return new Response(JSON.stringify({ error: "user_id é obrigatório" }), { status: 422, headers: CORS });
  }

  const SUPABASE_URL          = env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Variáveis de ambiente não configuradas" }), { status: 500, headers: CORS });
  }

  const adminHeaders = {
    "Content-Type": "application/json",
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
  };

  try {
    // 1) Confirma o e-mail do usuário automaticamente (sem isso o login falha)
    const confirmRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ email_confirm: true }),
    });
    if (!confirmRes.ok) {
      const errData = await confirmRes.json().catch(() => ({}));
      console.error("[activate-access] falha ao confirmar e-mail:", errData);
    }

    // 2) Vincula o token de pagamento ao usuário (best-effort, não bloqueia o cadastro)
    if (token) {
      const tokenRes = await fetch(
        `${SUPABASE_URL}/rest/v1/access_tokens?token=eq.${encodeURIComponent(token)}`,
        {
          method: "PATCH",
          headers: { ...adminHeaders, "Prefer": "return=minimal" },
          body: JSON.stringify({ used_at: new Date().toISOString(), user_id, payer_email: email || null }),
        }
      ).catch(() => null);
      if (tokenRes && !tokenRes.ok) {
        const errData = await tokenRes.json().catch(() => ({}));
        console.error("[activate-access] falha ao vincular token:", errData);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
  } catch (err) {
    console.error("[activate-access]", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
}
