// ============================================================
// content-unlock.js  –  Cole no final do seu index.html
// antes de </body>, após os outros scripts
// ============================================================

(async function () {
  // ── 1. Lê o token da URL ────────────────────────────────
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  if (!token) return; // visitante normal, sem token → não faz nada

  // ── 2. Valida com o backend ─────────────────────────────
  // ── CONFIG SUPABASE ── deve coincidir com o index.html ──
  const SUPABASE_URL  = 'https://ackovomkgkmjfhoidwti.supabase.co';

  let result;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/get-content?token=${encodeURIComponent(token)}`
    );
    result = await res.json();
  } catch (e) {
    console.warn("Erro ao validar token", e);
    return;
  }

  if (!result.ok || !result.medias) {
    // Token inválido ou expirado → mostra aviso discreto
    showTokenError();
    return;
  }

  // ── 3. Limpa o token da URL (sem reload) ─────────────────
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, "", cleanUrl);

  // ── 4. Renderiza as mídias no grid ───────────────────────
  renderMediaGrid(result.medias);

  // ── 5. Abre a aba "Mídias" automaticamente ───────────────
  openMediaTab();

  // ── 6. Esconde o botão de assinar (já pagou) ─────────────
  const subBtn = document.querySelector(".sub-btn");
  if (subBtn) subBtn.style.display = "none";

  // Personaliza saudação se tiver nome
  if (result.payerName) {
    const badge = document.querySelector(".pm-name");
    if (badge) badge.textContent = `Olá, ${result.payerName.split(" ")[0]}! 🎉`;
  }
})();

// ──────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────

function renderMediaGrid(medias) {
  const grid = document.querySelector("#sectionMedia .media-grid");
  if (!grid) return;

  grid.innerHTML = ""; // limpa items placeholder

  medias.forEach((media) => {
    const item = document.createElement("div");
    item.className = "media-item";
    item.dataset.type = media.type;

    if (media.type === "video" || media.type === "paid") {
      // Vídeo com play inline
      item.innerHTML = `
        <video
          src="${escHtml(media.url)}"
          poster="${escHtml(media.thumbnail || "")}"
          preload="none"
          playsinline
          controls
          style="width:100%;height:100%;object-fit:cover;border-radius:inherit;"
        ></video>
      `;
    } else {
      // Foto
      item.innerHTML = `
        <img
          src="${escHtml(media.url)}"
          alt="${escHtml(media.title || "")}"
          loading="lazy"
          style="width:100%;height:100%;object-fit:cover;border-radius:inherit;"
        />
      `;
    }

    // Clique na foto abre em lightbox simples
    if (media.type === "photo") {
      item.style.cursor = "pointer";
      item.addEventListener("click", () => openLightbox(media.url));
    }

    grid.appendChild(item);
  });

  // Filtro por tipo (pills: Todos / Fotos / Vídeos / Pagos)
  setupMediaFilter(grid);
}

function setupMediaFilter(grid) {
  const pills = document.querySelectorAll("#sectionMedia .media-pill");
  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      pills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");

      const label = pill.textContent.trim().toLowerCase();
      const typeMap = { todos: null, fotos: "photo", "vídeos": "video", pagos: "paid" };
      const filterType = typeMap[label] ?? null;

      grid.querySelectorAll(".media-item").forEach((item) => {
        item.style.display =
          filterType === null || item.dataset.type === filterType ? "" : "none";
      });
    });
  });
}

function openMediaTab() {
  // Simula clique na tab de Mídias (compatível com tabs.obf.js existente)
  const mediaTab = document.querySelector('[data-target="sectionMedia"]');
  if (mediaTab) {
    mediaTab.click();
  } else {
    // fallback: mostra a seção diretamente
    const section = document.getElementById("sectionMedia");
    const posts   = document.getElementById("sectionPosts");
    if (section) section.style.display = "";
    if (posts)   posts.style.display   = "none";
  }
}

function openLightbox(url) {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.92);
    display:flex;align-items:center;justify-content:center;
    z-index:99999;cursor:zoom-out;
  `;
  overlay.innerHTML = `<img src="${escHtml(url)}" style="max-width:94vw;max-height:90vh;border-radius:12px;object-fit:contain;">`;
  overlay.addEventListener("click", () => overlay.remove());
  document.body.appendChild(overlay);
}

function showTokenError() {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:#1a1a1a;color:#fff;padding:12px 20px;border-radius:12px;
    font-size:14px;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.3);
  `;
  toast.textContent = "Link de acesso inválido ou expirado.";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
