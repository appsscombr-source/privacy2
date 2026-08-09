// functions/api/pix-cashin.js
import { GATEWAYS } from "../../lib/gateways.js";
import { createClient } from "../../lib/supabase.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: CORS });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: CORS });
  }

  let body = {};
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: CORS });
  }

  const { amount, plan_code, buyer_email, site_url, gateway: gatewayName = "syncpay", ...cfg } = body;

  if (!amount) {
    return new Response(JSON.stringify({ error: "amount obrigatório" }), { status: 422, headers: CORS });
  }

  const gateway = GATEWAYS[gatewayName];
  if (!gateway) {
    return new Response(
      JSON.stringify({ error: `Gateway desconhecido: "${gatewayName}". Use: ${Object.keys(GATEWAYS).join(", ")}` }),
      { status: 422, headers: CORS }
    );
  }

  const missing = gateway.requiredFields.filter(f => !cfg[f]);
  if (missing.length) {
    return new Response(
      JSON.stringify({ error: `Campos obrigatórios para ${gateway.label}: ${missing.join(", ")}` }),
      { status: 422, headers: CORS }
    );
  }

  try {
    const webhookUrl = site_url ? `${site_url}/api/pix-webhook` : null;
    const result = await gateway.cashin(cfg, amount, webhookUrl);

    // Salva plan_code na pending_payments para o webhook usar na expiração
    let pendingDebug = null;
    if (!plan_code) {
      pendingDebug = { skipped: true, reason: "plan_code ausente no request" };
    } else if (result.identifier && env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      try {
        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
        const { error: pendingErr } = await supabase.from("pending_payments").upsert({
          identifier: result.identifier,
          payment_id: result.identifier,
          plan_code: plan_code,
          buyer_email: buyer_email || null,
          amount: parseFloat(amount),
          created_at: new Date().toISOString(),
        }, { onConflict: "payment_id" });
        if (pendingErr) { pendingDebug = pendingErr; console.error("pending_payments upsert error:", pendingErr); }
      } catch (e) {
        pendingDebug = { message: e.message };
        console.error("pending_payments upsert:", e);
      }
    }

    return new Response(JSON.stringify({ ok: true, ...result, _pending_debug: pendingDebug }), { status: 200, headers: CORS });
  } catch (err) {
    console.error(`[pix-cashin:${gatewayName}]`, err);
    const msg = (err && err.message) ? err.message : JSON.stringify(err);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: CORS });
  }
}
