// netlify/functions/pix-webhook.mjs
const HEADERS = { "Content-Type": "application/json" };

function detectGateway(body, headers) {
  const h = headers.get("x-gateway");
  if (h) return h;
  if (body.action?.startsWith("payment")) return "mercadopago";
  if (body.event?.startsWith("PAYMENT_")) return "asaas";
  if (body.pix) return "efibank";
  if (body.transactionId && body.status === "PAID") return "primepag";
  if (body.data?.id && body.data?.status) return "syncpay";
  return "generic";
}

function parsePayment(gateway, body) {
  switch (gateway) {
    case "asaas":
      if (!["PAYMENT_RECEIVED","PAYMENT_CONFIRMED"].includes(body.event)) return null;
      return { paymentId: body.payment?.id, status: "approved", amount: body.payment?.value, payerName: body.payment?.customer };
    case "efibank": {
      const pix = body.pix?.[0]; if (!pix) return null;
      return { paymentId: pix.endToEndId || pix.txid, status: "approved", amount: parseFloat(pix.valor), payerName: pix.infoPagador };
    }
    case "primepag":
      if (body.status !== "PAID") return null;
      return { paymentId: body.transactionId, status: "approved", amount: body.amount / 100, payerEmail: body.customer?.email, payerName: body.customer?.name };
    case "syncpay": {
      const d = body.data; if (!d || d.status !== "completed") return null;
      return { paymentId: d.id, status: "approved", amount: d.final_amount ?? d.amount, payerEmail: d.client?.email, payerName: d.debtor_account?.name || d.client?.name };
    }
    case "mercadopago":
      if (body.action !== "payment.updated") return null;
      return { paymentId: String(body.data?.id), status: "approved" };
    default:
      if (body.status === "approved" && body.paymentId) return body;
      return null;
  }
}

function sbFetch(url, key, path, options = {}) {
  return fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json", "Prefer": "return=representation", ...(options.headers || {}) },
  });
}

export async function handler(req) {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body; try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

  const gateway = detectGateway(body, req.headers);
  const parsed  = parsePayment(gateway, body);
  if (!parsed || parsed.status !== "approved") return new Response(JSON.stringify({ skipped: true }), { headers: HEADERS });

  const env          = process.env;
  const SUPABASE_URL = env.SUPABASE_URL;
  const SERVICE_KEY  = env.SUPABASE_SERVICE_KEY;

  // Evita duplicata
  const checkRes  = await sbFetch(SUPABASE_URL, SERVICE_KEY, `access_tokens?payment_id=eq.${encodeURIComponent(parsed.paymentId)}&select=id,token&limit=1`);
  const checkData = await checkRes.json();
  if (checkData[0]) return new Response(JSON.stringify({ ok: true, token: checkData[0].token, duplicate: true }), { headers: HEADERS });

  // Gera token
  const arr = new Uint8Array(32); crypto.getRandomValues(arr);
  const token = Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + 365);

  const insRes = await sbFetch(SUPABASE_URL, SERVICE_KEY, "access_tokens", {
    method: "POST",
    body: JSON.stringify({ token, payment_id: parsed.paymentId, payer_email: parsed.payerEmail || null, payer_name: parsed.payerName || null, amount: parsed.amount || null, expires_at: expiresAt.toISOString() }),
  });
  if (!insRes.ok) return new Response("DB error", { status: 500 });

  const siteUrl   = env.SITE_URL || "";
  const accessUrl = `${siteUrl}?token=${token}`;
  return new Response(JSON.stringify({ ok: true, token, accessUrl }), { headers: HEADERS });
}

export const config = { path: "/api/pix-webhook" };
