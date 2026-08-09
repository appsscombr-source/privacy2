// functions/api/check-payment.js
// Consultado via polling pelo frontend logo após gerar o PIX.
// Assim que o webhook do gateway criar o access_token (payment_id = identifier
// retornado na criação da cobrança), este endpoint devolve o token para o
// navegador poder redirecionar o lead para members.html.

import { createClient } from "../../lib/supabase.js";

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 200, headers: HEADERS });

  const url = new URL(request.url);
  const identifier = url.searchParams.get("identifier");

  if (!identifier) {
    return new Response(JSON.stringify({ error: "identifier obrigatório" }), { status: 400, headers: HEADERS });
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  const { data, error } = await supabase
    .from("access_tokens")
    .select("token")
    .eq("payment_id", identifier)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: "Erro ao consultar status" }), { status: 500, headers: HEADERS });
  }

  if (!data) {
    return new Response(JSON.stringify({ ok: true, paid: false }), { status: 200, headers: HEADERS });
  }

  return new Response(JSON.stringify({ ok: true, paid: true, token: data.token }), { status: 200, headers: HEADERS });
}
