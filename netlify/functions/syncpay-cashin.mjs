// netlify/functions/syncpay-cashin.mjs
const HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: HEADERS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: HEADERS });

  let body; try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: HEADERS }); }

  const { amount, client_id, client_secret, site_url } = body;
  if (!amount) return new Response(JSON.stringify({ error: "amount obrigatório" }), { status: 422, headers: HEADERS });
  if (!client_id || !client_secret) return new Response(JSON.stringify({ error: "Credenciais SyncPayments não configuradas" }), { status: 422, headers: HEADERS });

  const authRes = await fetch("https://api.syncpayments.com.br/api/partner/v1/auth-token", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id, client_secret }),
  });
  if (!authRes.ok) return new Response(JSON.stringify({ error: "SyncPay auth falhou" }), { status: 500, headers: HEADERS });
  const { access_token } = await authRes.json();

  const payload = { amount: parseFloat(amount), description: "Acesso ao conteúdo" };
  if (site_url) payload.webhook_url = `${site_url}/api/pix-webhook`;

  const res  = await fetch("https://api.syncpayments.com.br/api/partner/v1/cash-in", {
    method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${access_token}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) return new Response(JSON.stringify({ error: data.message || "Erro ao gerar cobrança" }), { status: res.status, headers: HEADERS });
  return new Response(JSON.stringify({ ok: true, pix_code: data.pix_code, identifier: data.identifier }), { status: 200, headers: HEADERS });
}

export const config = { path: "/api/syncpay-cashin" };
