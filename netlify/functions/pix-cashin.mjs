// netlify/functions/pix-cashin.mjs
// Importa gateways via URL relativa não funciona em Netlify — inline aqui
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

// ── Gateways inline ───────────────────────────────────────────────────────────
const GATEWAYS = {
  syncpay: {
    label: "SyncPayments",
    requiredFields: ["syncpay_client_id", "syncpay_client_secret"],
    async cashin(cfg, amount, webhookUrl) {
      const authRes = await fetch("https://api.syncpayments.com.br/api/partner/v1/auth-token", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: cfg.syncpay_client_id, client_secret: cfg.syncpay_client_secret }),
      });
      if (!authRes.ok) throw new Error("SyncPay auth falhou: " + await authRes.text());
      const { access_token } = await authRes.json();
      const payload = { amount: parseFloat(amount), description: "Acesso ao conteúdo" };
      if (webhookUrl) payload.webhook_url = webhookUrl;
      const res = await fetch("https://api.syncpayments.com.br/api/partner/v1/cash-in", {
        method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${access_token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erro SyncPay");
      return { pix_code: data.pix_code, identifier: data.identifier };
    },
  },
  nexuspag: {
    label: "NexusPag",
    requiredFields: ["nexuspag_api_key"],
    async cashin(cfg, amount, webhookUrl) {
      const payload = { amount: Math.round(parseFloat(amount) * 100), description: "Acesso ao conteúdo" };
      if (webhookUrl) payload.webhook_url = webhookUrl;
      const res = await fetch("https://api.nexuspag.com.br/v1/pix/cashin", {
        method: "POST", headers: { "Content-Type": "application/json", "x-api-key": cfg.nexuspag_api_key },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erro NexusPag");
      return { pix_code: data.pix_code || data.qr_code || data.payload, identifier: data.id || data.txid };
    },
  },
  asaas: {
    label: "Asaas",
    requiredFields: ["asaas_api_key"],
    async cashin(cfg, amount) {
      const base = cfg.asaas_sandbox ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/api/v3";
      const headers = { "Content-Type": "application/json", "access_token": cfg.asaas_api_key };
      const dueDate = new Date(Date.now() + 30 * 60 * 1000).toISOString().split("T")[0];
      const res  = await fetch(`${base}/payments`, { method: "POST", headers, body: JSON.stringify({ billingType: "PIX", value: parseFloat(amount), dueDate, description: "Acesso ao conteúdo" }) });
      const data = await res.json();
      if (!res.ok) throw new Error((data.errors && data.errors[0]?.description) || "Erro Asaas");
      const qrRes  = await fetch(`${base}/payments/${data.id}/pixQrCode`, { headers });
      const qrData = await qrRes.json();
      return { pix_code: qrData.payload, identifier: data.id };
    },
  },
  primepag: {
    label: "PrimePag",
    requiredFields: ["primepag_client_id", "primepag_client_secret"],
    async cashin(cfg, amount, webhookUrl) {
      const authRes = await fetch("https://api.primepag.com.br/auth/generate_token", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: cfg.primepag_client_id, client_secret: cfg.primepag_client_secret }),
      });
      if (!authRes.ok) throw new Error("PrimePag auth falhou");
      const { access_token } = await authRes.json();
      const payload = { amount: Math.round(parseFloat(amount) * 100), description: "Acesso ao conteúdo" };
      if (webhookUrl) payload.notification_url = webhookUrl;
      const res  = await fetch("https://api.primepag.com.br/v1/pix/qrcode/static", {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${access_token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erro PrimePag");
      return { pix_code: data.qr_code || data.pix_code, identifier: data.transactionId || data.id };
    },
  },
};

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: CORS });

  let body = {};
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: CORS }); }

  const { amount, site_url, gateway: gatewayName = "syncpay", ...cfg } = body;
  if (!amount) return new Response(JSON.stringify({ error: "amount obrigatório" }), { status: 422, headers: CORS });

  const gateway = GATEWAYS[gatewayName];
  if (!gateway) return new Response(JSON.stringify({ error: `Gateway desconhecido: "${gatewayName}"` }), { status: 422, headers: CORS });

  const missing = gateway.requiredFields.filter(f => !cfg[f]);
  if (missing.length) return new Response(JSON.stringify({ error: `Campos obrigatórios: ${missing.join(", ")}` }), { status: 422, headers: CORS });

  try {
    const webhookUrl = site_url ? `${site_url}/api/pix-webhook` : null;
    const result = await gateway.cashin(cfg, amount, webhookUrl);
    return new Response(JSON.stringify({ ok: true, ...result }), { status: 200, headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
}

export const config = { path: "/api/pix-cashin" };
