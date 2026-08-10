// netlify/functions/pix-cashin.mjs
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const GATEWAYS = {
  syncpay: {
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
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${access_token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erro SyncPay");
      return { pix_code: data.pix_code, identifier: data.identifier };
    },
  },
  nexuspag: {
    requiredFields: ["nexuspag_api_key"],
    async cashin(cfg, amount, webhookUrl) {
      const amountReais = parseFloat((parseFloat(amount) / 100).toFixed(2));
      const payload = { amount: amountReais, description: "Acesso ao conteúdo" };
      if (webhookUrl) payload.webhook_url = webhookUrl;
      const res = await fetch("https://nexuspag.com/api/pix/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": cfg.nexuspag_api_key },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || `NexusPag HTTP ${res.status}`);
      return {
        pix_code: data.pix_code || data.qr_code || data.payload || data.brcode || data.copy_paste,
        identifier: data.id || data.txid || data.external_id,
      };
    },
  },
  asaas: {
    requiredFields: ["asaas_api_key"],
    async cashin(cfg, amount) {
      const base = cfg.asaas_sandbox ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/api/v3";
      const headers = { "Content-Type": "application/json", "access_token": cfg.asaas_api_key };
      const dueDate = new Date(Date.now() + 30 * 60 * 1000).toISOString().split("T")[0];
      const res = await fetch(`${base}/payments`, { method: "POST", headers, body: JSON.stringify({ billingType: "PIX", value: parseFloat(amount) / 100, dueDate, description: "Acesso ao conteúdo" }) });
      const data = await res.json();
      if (!res.ok) throw new Error((data.errors && data.errors[0]?.description) || "Erro Asaas");
      const qrRes = await fetch(`${base}/payments/${data.id}/pixQrCode`, { headers });
      const qrData = await qrRes.json();
      return { pix_code: qrData.payload, identifier: data.id };
    },
  },
  primepag: {
    requiredFields: ["primepag_client_id", "primepag_client_secret"],
    async cashin(cfg, amount, webhookUrl) {
      const authRes = await fetch("https://api.primepag.com.br/auth/generate_token", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: cfg.primepag_client_id, client_secret: cfg.primepag_client_secret }),
      });
      if (!authRes.ok) throw new Error("PrimePag auth falhou");
      const { access_token } = await authRes.json();
      const payload = { amount: Math.round(parseFloat(amount)), description: "Acesso ao conteúdo" };
      if (webhookUrl) payload.notification_url = webhookUrl;
      const res = await fetch("https://api.primepag.com.br/v1/pix/qrcode/static", {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${access_token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erro PrimePag");
      return { pix_code: data.qr_code || data.pix_code, identifier: data.transactionId || data.id };
    },
  },
  omegapay: {
    requiredFields: ["omegapay_public_key", "omegapay_secret_key"],
    async cashin(cfg, amount, webhookUrl, buyer) {
      buyer = buyer || {};
      const identifier = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : (Date.now().toString(36) + Math.random().toString(36).slice(2));
      const payload = {
        identifier,
        amount: parseFloat(amount),
        client: { name: buyer.name || "Cliente", email: buyer.email || "", phone: buyer.phone || "", document: buyer.document || "" },
      };
      if (webhookUrl) payload.callbackUrl = webhookUrl;
      const res = await fetch("https://app.omegapayments.com.br/api/v1/gateway/pix/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-public-key": cfg.omegapay_public_key, "x-secret-key": cfg.omegapay_secret_key },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = data.details ? ` (campo: ${data.details.field}, valor: ${JSON.stringify(data.details.value)}, motivo: ${data.details.issue})` : "";
        throw new Error((data.message || "Erro ao gerar cobrança OmegaPay") + detail);
      }
      return { pix_code: data.pix && data.pix.code, qr_code_url: data.pix && data.pix.image, identifier };
    },
  },
};

export default async (req, context) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: CORS });

  let body = {};
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: CORS }); }

  const { amount, site_url, buyer_name, buyer_email, buyer_phone, buyer_document, gateway: gatewayName = "syncpay", ...cfg } = body;
  if (!amount) return new Response(JSON.stringify({ error: "amount obrigatório" }), { status: 422, headers: CORS });

  const gateway = GATEWAYS[gatewayName];
  if (!gateway) return new Response(JSON.stringify({ error: `Gateway desconhecido: "${gatewayName}"` }), { status: 422, headers: CORS });

  const missing = gateway.requiredFields.filter(f => !cfg[f]);
  if (missing.length) return new Response(JSON.stringify({ error: `Campos obrigatórios: ${missing.join(", ")}` }), { status: 422, headers: CORS });

  try {
    const webhookUrl = site_url ? `${site_url}/api/pix-webhook` : null;
    const buyer = { name: buyer_name, email: buyer_email, phone: buyer_phone, document: buyer_document };
    const result = await gateway.cashin(cfg, amount, webhookUrl, buyer);
    return new Response(JSON.stringify({ ok: true, ...result }), { status: 200, headers: CORS });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message, cause: String(err.cause || ""), stack: err.stack }),
      { status: 500, headers: CORS }
    );
  }
};

export const config = { path: "/api/pix-cashin" };
