// functions/api/syncpay-cashin.js
const SYNCPAY_BASE = "https://api.syncpayments.com.br";

async function getBearerToken(client_id, client_secret) {
  const res = await fetch(`${SYNCPAY_BASE}/api/partner/v1/auth-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id, client_secret }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SyncPayments auth falhou (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.access_token;
}

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequest({ request }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: HEADERS });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: HEADERS });
  }

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: HEADERS });
  }

  const { amount, client_id, client_secret, site_url } = body;

  if (!amount) {
    return new Response(JSON.stringify({ error: "Campo obrigatório: amount" }), { status: 422, headers: HEADERS });
  }
  if (!client_id || !client_secret) {
    return new Response(JSON.stringify({ error: "Credenciais SyncPayments não configuradas no painel admin." }), { status: 422, headers: HEADERS });
  }

  try {
    const token = await getBearerToken(client_id, client_secret);
    const webhookUrl = site_url ? `${site_url}/api/pix-webhook` : null;

    const payload = {
      amount: parseFloat(amount),
      description: "Acesso ao conteúdo",
      ...(webhookUrl && { webhook_url: webhookUrl }),
    };

    const res = await fetch(`${SYNCPAY_BASE}/api/partner/v1/cash-in`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("SyncPayments cashin error:", data);
      return new Response(
        JSON.stringify({ error: data.message || "Erro ao gerar cobrança", details: data.errors }),
        { status: res.status, headers: HEADERS }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, pix_code: data.pix_code, identifier: data.identifier }),
      { status: 200, headers: HEADERS }
    );
  } catch (err) {
    console.error("syncpay-cashin error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: HEADERS });
  }
}
