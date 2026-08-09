// netlify/functions/admin-profile.mjs

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const GW_FIELDS = new Set([
  "site_url","gateway",
  "syncpay_client_id","syncpay_client_secret",
  "nexuspag_api_key","nexuspag_webhook_secret","nexuspag_sandbox",
  "asaas_api_key","asaas_sandbox",
  "efibank_client_id","efibank_client_secret","efibank_pix_key","efibank_sandbox",
  "primepag_client_id","primepag_client_secret",
]);

function errRes(msg, status = 500) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: HEADERS });
}

async function sbGet(url, key, table, rowKey) {
  const res = await fetch(`${url}/rest/v1/${table}?key=eq.${encodeURIComponent(rowKey)}&select=value&limit=1`, {
    headers: { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`sbGet ${res.status}: ${txt}`);
  }
  const rows = await res.json();
  return rows[0]?.value || null;
}

async function sbUpsert(url, key, table, rowKey, value) {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({ key: rowKey, value }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`sbUpsert ${res.status}: ${txt}`);
  }
  return true;
}

export async function handler(req) {
  try {
    const env        = process.env;
    const SUPABASE_URL = env.SUPABASE_URL;
    const SERVICE_KEY  = env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL)  return errRes("env SUPABASE_URL não definida");
    if (!SERVICE_KEY)   return errRes("env SUPABASE_SERVICE_KEY não definida");

    const modelId    = (env.MODEL_ID || "default").trim();
    const profileKey = `profile_${modelId}`;
    const gwKey      = `gateway_config_${modelId}`;

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: HEADERS });
    }

    // ── GET ─────────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      const [profile, gw] = await Promise.all([
        sbGet(SUPABASE_URL, SERVICE_KEY, "site_config", profileKey),
        sbGet(SUPABASE_URL, SERVICE_KEY, "site_config", gwKey),
      ]);
      return new Response(
        JSON.stringify({ ...(profile || {}), ...(gw || {}), _model_id: modelId }),
        { status: 200, headers: HEADERS }
      );
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (req.method === "POST") {
      const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
      if (!jwt) return errRes("Não autorizado — token ausente", 401);

      // Valida JWT via REST do Supabase usando a service key
      const authRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${jwt}` },
      });
      if (!authRes.ok) {
        const detail = await authRes.json().catch(() => ({}));
        return errRes("Sessão inválida: " + JSON.stringify(detail), 401);
      }
      const authUser = await authRes.json().catch(() => null);
      if (!authUser?.id) return errRes("Sessão inválida — sem user.id", 401);

      let body;
      try { body = await req.json(); }
      catch { return errRes("JSON inválido no body", 400); }

      const gwPayload = {}, profilePayload = {};
      for (const [k, v] of Object.entries(body)) {
        if (k === "_model_id") continue;
        if (GW_FIELDS.has(k)) gwPayload[k] = v;
        else profilePayload[k] = v;
      }
      profilePayload.model_id = modelId;

      await Promise.all([
        sbUpsert(SUPABASE_URL, SERVICE_KEY, "site_config", gwKey, gwPayload),
        sbUpsert(SUPABASE_URL, SERVICE_KEY, "site_config", profileKey, profilePayload),
      ]);

      return new Response(JSON.stringify({ ok: true, model_id: modelId }), { status: 200, headers: HEADERS });
    }

    return new Response("Method Not Allowed", { status: 405 });

  } catch(e) {
    return new Response(
      JSON.stringify({ error: "Exceção: " + String(e), stack: e?.stack }),
      { status: 500, headers: HEADERS }
    );
  }
}

export const config = { path: "/api/admin-profile" };
