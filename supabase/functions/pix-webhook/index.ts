// supabase/functions/pix-webhook/index.ts
// Recebe notificação de pagamento PIX confirmado
// POST https://<project>.supabase.co/functions/v1/pix-webhook
// Compatível com: Asaas, EfiBank, PrimePag, SyncPayments, MercadoPago

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Content-Type": "application/json" };

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");
}

function detectGateway(body: any, headers: Headers): string {
  const xGateway = headers.get("x-gateway");
  if (xGateway) return xGateway;
  if (body.action?.startsWith("payment")) return "mercadopago";
  if (body.event?.startsWith("PAYMENT_")) return "asaas";
  if (body.pix) return "efibank";
  if (body.transactionId && body.status === "PAID") return "primepag";
  if (body.data?.id && body.data?.status) return "syncpay";
  return "generic";
}

function parsePayment(gateway: string, body: any): any {
  switch (gateway) {
    case "asaas":
      if (!["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(body.event)) return null;
      return { paymentId: body.payment?.id, status: "approved", amount: body.payment?.value, payerName: body.payment?.customer };
    case "efibank": {
      const pix = body.pix?.[0];
      if (!pix) return null;
      return { paymentId: pix.endToEndId || pix.txid, status: "approved", amount: parseFloat(pix.valor), payerName: pix.infoPagador };
    }
    case "primepag":
      if (body.status !== "PAID") return null;
      return { paymentId: body.transactionId, status: "approved", amount: body.amount, payerEmail: body.customer?.email, payerName: body.customer?.name };
    case "syncpay": {
      const d = body.data;
      if (!d || d.status !== "completed") return null;
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: any;
  try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

  const gateway = detectGateway(body, req.headers);
  const parsed = parsePayment(gateway, body);

  if (!parsed || parsed.status !== "approved") {
    return new Response(JSON.stringify({ skipped: true }), { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Evita duplicata
  const { data: existing } = await supabase
    .from("access_tokens")
    .select("id, token")
    .eq("payment_id", parsed.paymentId)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ ok: true, token: existing.token, duplicate: true }), { headers: corsHeaders });
  }

  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 365);

  const { error } = await supabase.from("access_tokens").insert({
    token,
    payment_id: parsed.paymentId,
    payer_email: parsed.payerEmail || null,
    payer_name: parsed.payerName || null,
    amount: parsed.amount || null,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error("DB error:", error);
    return new Response("DB error", { status: 500 });
  }

  // Pega site_url da config — tenta o model_id vindo no body do webhook (se o gateway enviar)
  const bodyModelId = body.model_id || null;
  const gwKey = bodyModelId ? `gateway_config_${bodyModelId}` : "gateway_config_default";
  const { data: cfg } = await supabase
    .from("site_config")
    .select("value")
    .eq("key", gwKey)
    .maybeSingle();

  const siteUrl = (cfg?.value?.site_url || "").replace(/\/$/, "");
  const accessUrl = `${siteUrl}?token=${token}`;

  console.log(`✅ Acesso liberado | payment: ${parsed.paymentId} | url: ${accessUrl}`);

  return new Response(JSON.stringify({ ok: true, token, accessUrl }), { headers: corsHeaders });
});
