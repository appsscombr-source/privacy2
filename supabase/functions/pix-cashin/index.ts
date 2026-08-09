// supabase/functions/pix-cashin/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Gateways ────────────────────────────────────────────────────

async function cashinSyncpay(cfg: any, amount: number, webhookUrl: string | null) {
  const authRes = await fetch("https://api.syncpayments.com.br/api/partner/v1/auth-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: cfg.syncpay_client_id, client_secret: cfg.syncpay_client_secret }),
  });
  if (!authRes.ok) throw new Error("SyncPay auth falhou: " + await authRes.text());
  const { access_token } = await authRes.json();

  const payload: any = { amount, description: "Acesso ao conteúdo" };
  if (webhookUrl) payload.webhook_url = webhookUrl;

  const res = await fetch("https://api.syncpayments.com.br/api/partner/v1/cash-in", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${access_token}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Erro SyncPay");
  return { pix_code: data.pix_code, identifier: data.identifier };
}

async function cashinNexuspag(cfg: any, amount: number, webhookUrl: string | null) {
  const base = cfg.nexuspag_sandbox
    ? "https://sandbox.api.nexuspag.com.br"
    : "https://api.nexuspag.com.br";

  const amountCents = Math.round(amount * 100);
  const payload: any = { amount: amountCents, description: "Acesso ao conteúdo" };
  if (webhookUrl) payload.webhook_url = webhookUrl;

  const res = await fetch(base + "/v1/pix/cashin", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": cfg.nexuspag_api_key },
    body: JSON.stringify(payload),
  });
  const rawText = await res.text();
  let data: any;
  try { data = JSON.parse(rawText); } catch { throw new Error("NexusPag retornou: " + rawText); }
  if (!res.ok) throw new Error(data.message || data.error || "Erro NexusPag (status " + res.status + ")");
  return {
    pix_code: data.pix_code || data.qr_code || data.payload || data.brcode,
    identifier: data.id || data.transaction_id || data.txid,
  };
}

async function cashinAsaas(cfg: any, amount: number) {
  const base = cfg.asaas_sandbox ? "https://sandbox.asaas.com/api/v3" : "https://api.asaas.com/api/v3";
  const headers: any = { "Content-Type": "application/json", "access_token": cfg.asaas_api_key };
  const dueDate = new Date(Date.now() + 30 * 60 * 1000).toISOString().split("T")[0];
  const res = await fetch(base + "/payments", {
    method: "POST", headers,
    body: JSON.stringify({ billingType: "PIX", value: amount, dueDate, description: "Acesso ao conteúdo" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data.errors && data.errors[0]?.description) || "Erro Asaas");
  const qrRes = await fetch(base + "/payments/" + data.id + "/pixQrCode", { headers });
  const qrData = await qrRes.json();
  return { pix_code: qrData.payload, identifier: data.id };
}

// ── Main ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { amount, model_id } = body;
    if (!amount || isNaN(parseFloat(amount))) {
      return new Response(JSON.stringify({ error: "Campo obrigatório: amount" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const gwKey = model_id ? `gateway_config_${model_id}` : "gateway_config_default";
    const { data: row } = await sb
      .from("site_config").select("value").eq("key", gwKey).maybeSingle();

    const cfg = row?.value || {};
    const gateway = cfg.gateway || "syncpay";
    const siteUrl = cfg.site_url || "";
    const webhookUrl = siteUrl ? `${siteUrl}/api/pix-webhook` : null;
    const amt = parseFloat(amount);

    let result;
    if (gateway === "nexuspag") {
      if (!cfg.nexuspag_api_key) throw new Error("API key NexusPag não configurada.");
      result = await cashinNexuspag(cfg, amt, webhookUrl);
    } else if (gateway === "asaas") {
      if (!cfg.asaas_api_key) throw new Error("API key Asaas não configurada.");
      result = await cashinAsaas(cfg, amt);
    } else {
      if (!cfg.syncpay_client_id || !cfg.syncpay_client_secret) throw new Error("Credenciais SyncPay não configuradas.");
      result = await cashinSyncpay(cfg, amt, webhookUrl);
    }

    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
