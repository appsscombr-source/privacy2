// functions/api/create-token.js
import { createClient } from "../../lib/supabase.js";

export async function onRequest({ request, env }) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const headers = { "Content-Type": "application/json" };
  const url = new URL(request.url);

  const secret = url.searchParams.get("secret");
  if (secret !== env.ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers });
  }

  const days = parseInt(url.searchParams.get("days") || "36500");
  const label = url.searchParams.get("label") || "acesso-manual";

  // Gera token seguro via Web Crypto API (disponível no Cloudflare Workers)
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
    return new Response(JSON.stringify({ error }), { status: 500, headers });
  }

  const siteUrl = env.SITE_URL || "";
  const accessUrl = `${siteUrl}?token=${token}`;
  return new Response(JSON.stringify({ ok: true, token, accessUrl, expiresAt }), { status: 200, headers });
}
