// functions/api/admin-profile.js
import { createClient } from "../../lib/supabase.js";

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

const GW_FIELDS = new Set([
  "site_url","gateway",
  "syncpay_client_id","syncpay_client_secret",
  "nexuspag_api_key","nexuspag_webhook_secret","nexuspag_sandbox",
  "asaas_api_key","asaas_sandbox",
  "efibank_client_id","efibank_client_secret","efibank_pix_key","efibank_sandbox",
  "primepag_client_id","primepag_client_secret",
]);

function err(msg, status = 500) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: HEADERS });
}

export async function onRequest({ request, env }) {
  try {
    // Diagnóstico: valida env vars obrigatórias
    if (!env.SUPABASE_URL)      return err("env SUPABASE_URL não definida");
    if (!env.SUPABASE_SERVICE_KEY) return err("env SUPABASE_SERVICE_KEY não definida");

    const modelId    = (env.MODEL_ID || "default").trim();
    const profileKey = `profile_${modelId}`;
    const gwKey      = `gateway_config_${modelId}`;

    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: HEADERS });
    }

    // ── GET ─────────────────────────────────────────────────────────────────
    if (request.method === "GET") {
      const [profileRow, gwRow] = await Promise.all([
        supabase.from("site_config").select("value").eq("key", profileKey).maybeSingle(),
        supabase.from("site_config").select("value").eq("key", gwKey).maybeSingle(),
      ]);

      if (profileRow.error) return err("Supabase GET profile error: " + JSON.stringify(profileRow.error));
      if (gwRow.error)      return err("Supabase GET gw error: "      + JSON.stringify(gwRow.error));

      const profile = profileRow.data?.value || {};
      const gw      = gwRow.data?.value     || {};

      return new Response(
        JSON.stringify({ ...profile, ...gw, _model_id: modelId }),
        { status: 200, headers: HEADERS }
      );
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (request.method === "POST") {
      const authHeader = request.headers.get("Authorization") || "";
      const jwt = authHeader.replace("Bearer ", "").trim();

      if (!jwt) return err("Não autorizado — token ausente", 401);

      // Valida JWT via REST do Supabase
      const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
          "apikey": env.SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${jwt}`,
        },
      });
      if (!authRes.ok) {
        const authErr = await authRes.json().catch(() => ({}));
        return err("Sessão inválida: " + JSON.stringify(authErr), 401);
      }
      const authUser = await authRes.json().catch(() => null);
      if (!authUser?.id) return err("Sessão inválida — sem user.id", 401);

      let body;
      try { body = await request.json(); }
      catch { return err("JSON inválido no body", 400); }

      const gwPayload      = {};
      const profilePayload = {};
      for (const [k, v] of Object.entries(body)) {
        if (k === "_model_id") continue;
        if (GW_FIELDS.has(k)) gwPayload[k] = v;
        else profilePayload[k] = v;
      }
      profilePayload.model_id = modelId;

      const [gwRes, profileRes] = await Promise.all([
        supabase.from("site_config").upsert({ key: gwKey,      value: gwPayload      }, { onConflict: "key" }),
        supabase.from("site_config").upsert({ key: profileKey, value: profilePayload }, { onConflict: "key" }),
      ]);

      if (gwRes.error || profileRes.error) {
        return err({
          gw_error:      gwRes.error      ? JSON.stringify(gwRes.error)      : null,
          profile_error: profileRes.error ? JSON.stringify(profileRes.error) : null,
        });
      }

      return new Response(JSON.stringify({ ok: true, model_id: modelId }), { status: 200, headers: HEADERS });
    }

    return new Response("Method Not Allowed", { status: 405 });

  } catch (e) {
    // Captura qualquer exceção inesperada e retorna o stack no body
    return new Response(
      JSON.stringify({ error: "Exceção inesperada", detail: String(e), stack: e?.stack }),
      { status: 500, headers: HEADERS }
    );
  }
}
