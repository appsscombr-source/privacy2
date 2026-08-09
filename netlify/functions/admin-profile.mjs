// netlify/functions/admin-profile.mjs
// Espelha functions/api/admin-profile.js para Netlify Functions

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

function sbFetch(supabaseUrl, serviceKey, path, options = {}) {
  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": serviceKey,
      "Authorization": `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
      ...(options.headers || {}),
    },
  });
}

async function sbGet(supabaseUrl, serviceKey, table, key) {
  const res = await sbFetch(supabaseUrl, serviceKey,
    `${table}?key=eq.${encodeURIComponent(key)}&select=value&limit=1`
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0]?.value || null;
}

async function sbUpsert(supabaseUrl, serviceKey, table, key, value) {
  const res = await sbFetch(supabaseUrl, serviceKey, table, {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ key, value }),
  });
  return res.ok;
}

async function verifyJwt(supabaseUrl, anonKey, userJwt) {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { "apikey": anonKey, "Authorization": `Bearer ${userJwt}` },
  });
  return res.ok;
}

export default async function handler(req) {
  const env = process.env;
  const modelId    = (env.MODEL_ID || "default").trim();
  const profileKey = `profile_${modelId}`;
  const gwKey      = `gateway_config_${modelId}`;
  const SUPABASE_URL = env.SUPABASE_URL;
  const SERVICE_KEY  = env.SUPABASE_SERVICE_KEY;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: HEADERS });
  }

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

  if (req.method === "POST") {
    const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: HEADERS });
    }

    const anonKey = env.SUPABASE_ANON_KEY || SERVICE_KEY;
    const valid = await verifyJwt(SUPABASE_URL, anonKey, jwt);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Sessão inválida ou expirada." }), { status: 401, headers: HEADERS });
    }

    let body;
    try { body = await req.json(); } catch {
      return new Response('{"error":"JSON inválido"}', { status: 400, headers: HEADERS });
    }

    const gwPayload = {}, profilePayload = {};
    for (const [k, v] of Object.entries(body)) {
      if (k === "_model_id") continue;
      if (GW_FIELDS.has(k)) gwPayload[k] = v;
      else profilePayload[k] = v;
    }
    profilePayload.model_id = modelId;

    const [okGw, okProfile] = await Promise.all([
      sbUpsert(SUPABASE_URL, SERVICE_KEY, "site_config", gwKey, gwPayload),
      sbUpsert(SUPABASE_URL, SERVICE_KEY, "site_config", profileKey, profilePayload),
    ]);

    if (!okGw || !okProfile) {
      return new Response(JSON.stringify({ error: "Erro ao salvar no banco" }), { status: 500, headers: HEADERS });
    }

    return new Response(JSON.stringify({ ok: true, model_id: modelId }), { status: 200, headers: HEADERS });
  }

  return new Response("Method Not Allowed", { status: 405 });
}

export const config = { path: "/api/admin-profile" };
