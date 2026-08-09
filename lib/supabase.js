// lib/supabase.js
// Cliente Supabase leve usando fetch puro — sem dependências externas

export function createClient(url, key) {
  const headers = {
    "apikey": key,
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };

  function rest(path) {
    const base = `${url}/rest/v1/${path}`;
    return {
      async _req(method, body, extra = "") {
        const res = await fetch(`${base}${extra}`, { method, headers: { ...headers, ...(body ? {} : { "Prefer": "return=representation" }) }, body: body ? JSON.stringify(body) : undefined });
        const data = await res.json().catch(() => ({}));
        return { data: res.ok ? data : null, error: res.ok ? null : data };
      },
      select(cols = "*") {
        let filters = [];
        let single = false;
        let maybeS = false;
        const q = {
          eq(col, val)    { filters.push(`${col}=eq.${encodeURIComponent(val)}`); return q; },
          order(col, { ascending = true } = {}) { filters.push(`order=${col}.${ascending ? "asc" : "desc"}`); return q; },
          single()        { single = true; return q; },
          maybeSingle()   { maybeS = true; return q; },
          async then(resolve, reject) {
            try {
              const qs = filters.length ? "?" + filters.join("&") : "";
              const h = { ...headers };
              if (single || maybeS) h["Accept"] = "application/vnd.pgrst.object+json";
              const res = await fetch(`${base}?select=${cols}${filters.length ? "&" + filters.join("&") : ""}`, { headers: h });
              if (res.status === 406 || res.status === 404) return resolve({ data: null, error: null });
              const data = await res.json().catch(() => ({}));
              resolve({ data: res.ok ? data : null, error: res.ok ? null : data });
            } catch(e) { reject(e); }
          }
        };
        return q;
      },
      insert(body) {
        const q = {
          select() { return q; },
          single()  { return q; },
          async then(resolve, reject) {
            try {
              const res = await fetch(base, { method: "POST", headers, body: JSON.stringify(body) });
              const data = await res.json().catch(() => ({}));
              resolve({ data: res.ok ? (Array.isArray(data) ? data[0] : data) : null, error: res.ok ? null : data });
            } catch(e) { reject(e); }
          }
        };
        return q;
      },
      update(body) {
        let filters = [];
        const q = {
          eq(col, val) { filters.push(`${col}=eq.${encodeURIComponent(val)}`); return q; },
          async then(resolve, reject) {
            try {
              const qs = filters.length ? "?" + filters.join("&") : "";
              const res = await fetch(`${base}${qs}`, { method: "PATCH", headers, body: JSON.stringify(body) });
              const data = await res.json().catch(() => ({}));
              resolve({ data: res.ok ? data : null, error: res.ok ? null : data });
            } catch(e) { reject(e); }
          }
        };
        return q;
      },
      delete() {
        let filters = [];
        const q = {
          eq(col, val) { filters.push(`${col}=eq.${encodeURIComponent(val)}`); return q; },
          async then(resolve, reject) {
            try {
              const qs = filters.length ? "?" + filters.join("&") : "";
              const res = await fetch(`${base}${qs}`, { method: "DELETE", headers });
              const data = await res.json().catch(() => ({}));
              resolve({ data: res.ok ? data : null, error: res.ok ? null : data });
            } catch(e) { reject(e); }
          }
        };
        return q;
      },
      upsert(body, { onConflict } = {}) {
        // POST com Prefer: resolution=merge-duplicates faz upsert no PostgREST
        const upsertHeaders = {
          ...headers,
          "Prefer": "resolution=merge-duplicates,return=representation",
        };
        if (onConflict) upsertHeaders["Prefer"] += `,on_conflict=${onConflict}`;
        return {
          async then(resolve, reject) {
            try {
              const res = await fetch(base, {
                method: "POST",
                headers: upsertHeaders,
                body: JSON.stringify(body),
              });
              const data = await res.json().catch(() => ({}));
              resolve({ data: res.ok ? data : null, error: res.ok ? null : data });
            } catch(e) { reject(e); }
          }
        };
      },
    };
  }

  return {
    from: (table) => rest(table),
  };
}
