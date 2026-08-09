// supabase/functions/create-token/index.ts
// Gera token de acesso manual (admin logado)
// POST https://<project>.supabase.co/functions/v1/create-token
// Body: { days?: number, label?: string }
// Header: Authorization: Bearer <supabase_anon_key> + usuário autenticado

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("", { headers: corsHeaders });

  // Autentica via JWT do usuário logado
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: corsHeaders });
  }

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: corsHeaders });
  }

  // Usa service_role para inserir
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const body = await req.json().catch(() => ({}));
  const days = parseInt(body.days || "36500");
  const label = body.label || "acesso-manual";

  // Gera token seguro
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const token = Array.from(array).map(b => b.toString(16).padStart(2, "0")).join("");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);

  const { error } = await supabase.from("access_tokens").insert({
    token,
    payment_id: label,
    payer_name: label,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    return new Response(JSON.stringify({ error }), { status: 500, headers: corsHeaders });
  }

  // Pega site_url da config
  const { data: cfg } = await supabase
    .from("site_config")
    .select("value")
    .eq("key", "gateway_config")
    .maybeSingle();

  const siteUrl = (cfg?.value?.site_url || "").replace(/\/$/, "");
  const accessUrl = `${siteUrl}?token=${token}`;

  return new Response(
    JSON.stringify({ ok: true, token, accessUrl, expiresAt }),
    { headers: corsHeaders }
  );
});
