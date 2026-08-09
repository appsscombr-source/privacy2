// supabase/functions/syncpay-cashin/index.ts
// Gera cobrança PIX via SyncPayments
// POST https://<project>.supabase.co/functions/v1/syncpay-cashin
// Body: { amount, name, cpf, email, phone }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SYNCPAY_BASE = "https://api.syncpayments.com.br";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

let _tokenCache: { token: string | null; expiresAt: number } = { token: null, expiresAt: 0 };

async function getBearerToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (_tokenCache.token && now < _tokenCache.expiresAt - 60_000) return _tokenCache.token;

  const res = await fetch(`${SYNCPAY_BASE}/api/partner/v1/auth-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });

  if (!res.ok) throw new Error(`SyncPayments auth falhou (${res.status})`);
  const data = await res.json();
  _tokenCache = { token: data.access_token, expiresAt: now + (data.expires_in ?? 3600) * 1000 };
  return _tokenCache.token!;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), { status: 405, headers: corsHeaders });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400, headers: corsHeaders });
  }

  const { amount, name, cpf, email, phone, model_id } = body;
  if (!amount || !name || !cpf || !email || !phone) {
    return new Response(
      JSON.stringify({ error: "Campos obrigatórios: amount, name, cpf, email, phone" }),
      { status: 422, headers: corsHeaders }
    );
  }

  // Lê credenciais da site_config por model_id
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const gwKey = model_id ? `gateway_config_${model_id}` : "gateway_config_default";
  const { data: cfg } = await supabase
    .from("site_config")
    .select("value")
    .eq("key", gwKey)
    .maybeSingle();

  const clientId     = cfg?.value?.syncpay_client_id;
  const clientSecret = cfg?.value?.syncpay_client_secret;
  const siteUrl      = (cfg?.value?.site_url || "").replace(/\/$/, "");

  if (!clientId || !clientSecret) {
    return new Response(
      JSON.stringify({ error: "Credenciais SyncPayments não configuradas no painel admin" }),
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    const token = await getBearerToken(clientId, clientSecret);
    const webhookUrl = siteUrl ? `${siteUrl.replace("https://", "https://")}/functions/v1/pix-webhook` : null;

    // Limpa CPF e telefone
    const cpfClean   = String(cpf).replace(/\D/g, "");
    const phoneClean = String(phone).replace(/\D/g, "");

    const payload: any = {
      amount: parseFloat(amount),
      description: "Acesso ao conteúdo",
      client: { name: String(name), cpf: cpfClean, email: String(email), phone: phoneClean },
    };
    if (webhookUrl) payload.webhook_url = webhookUrl;

    const res = await fetch(`${SYNCPAY_BASE}/api/partner/v1/cash-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: data.message || "Erro ao gerar cobrança", details: data.errors }),
        { status: res.status, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, pix_code: data.pix_code, identifier: data.identifier }),
      { headers: corsHeaders }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
