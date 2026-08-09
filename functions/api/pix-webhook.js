// functions/api/pix-webhook.js
import { createClient } from "../../lib/supabase.js";
import { PARSERS, detectGateway } from "../../lib/gateways.js";

export async function onRequest({ request, env }) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body;
  try { body = await request.json(); } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const gateway = detectGateway(body, request.headers);
  const parser  = PARSERS[gateway] || PARSERS.generic;
  const parsed  = parser(body);

  if (!parsed || parsed.status !== "approved") {
    return new Response(JSON.stringify({ skipped: true, gateway }), { status: 200 });
  }

  // Evita duplicata
  const { data: existing } = await supabase
    .from("access_tokens").select("id, token")
    .eq("payment_id", parsed.paymentId).maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ ok: true, token: existing.token, duplicate: true }), { status: 200 });
  }

  // Gera token seguro via Web Crypto API
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const token = Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");

  // Busca plan_code na pending_payments para calcular expiração
  const PLAN_DAYS = {
    'PLAN_1M':  1,
    'PLAN_3M':  3,
    'PLAN_12M': 5,
  };

  let expirationDays = 1; // padrão: 1 dia
  const { data: pending } = await supabase
    .from("pending_payments")
    .select("plan_code, buyer_email")
    .eq("payment_id", parsed.paymentId)
    .maybeSingle();

  if (pending && pending.plan_code && PLAN_DAYS[pending.plan_code] !== undefined) {
    expirationDays = PLAN_DAYS[pending.plan_code];
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expirationDays);

  // Prioriza o e-mail da conta logada (buyer_email) sobre o e-mail do pagador
  // vindo do gateway (que costuma ser o dono da conta bancária, e não bate
  // com o e-mail de cadastro do site). Isso garante que a checagem de
  // "acesso ativo" após login funcione corretamente.
  const linkedEmail = (pending && pending.buyer_email) || parsed.payerEmail || null;

  const { error } = await supabase.from("access_tokens").insert({
    token,
    payment_id:  parsed.paymentId,
    payer_email: linkedEmail,
    payer_name:  parsed.payerName  || null,
    amount:      parsed.amount     || null,
    expires_at:  expiresAt.toISOString(),
  });

  if (error) {
    console.error("Supabase insert error:", error);
    return new Response("DB error", { status: 500 });
  }

  const siteUrl  = env.SITE_URL || "";
  const accessUrl = `${siteUrl}?token=${token}`;
  console.log(`✅ Acesso liberado | gateway: ${gateway} | payment: ${parsed.paymentId} | url: ${accessUrl}`);

  return new Response(JSON.stringify({ ok: true, token, accessUrl }), { status: 200 });
}
