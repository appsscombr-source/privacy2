// pix-modal.js — SyncPayments, sem formulário
// Inclua após content-unlock.js no index.html

(function () {
  var SUPABASE_URL  = window.SUPABASE_URL  || '';
  var SUPABASE_ANON = window.SUPABASE_ANON || '';

  var _gwConfig = null;
  var _selectedPrice = 0;
  var _selectedPlanCode = '';
  var _timerInterval = null;
  var _pollingInterval = null;
  var _pixLoading = false; // guard contra chamadas duplicadas

  // ── Carrega gateway_config via /api/admin-profile (separado por modelo) ──
  function loadGwConfig() {
    if (_gwConfig) return Promise.resolve(_gwConfig);
    return fetch('/api/admin-profile')
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (cfg) { _gwConfig = cfg || {}; return _gwConfig; })
      .catch(function () { return {}; });
  }

  // ── Abre modal e já dispara geração do PIX ──────────────
  window.openPayModal = function (planCode, priceStr) {
    if (_pixLoading) return;

    var raw = (priceStr || '0').replace(/[^\d,\.]/g, '').replace(',', '.');
    _selectedPrice = parseFloat(raw) || 0;
    _selectedPlanCode = planCode || '';

    var modal = document.getElementById('payModal');
    if (!modal) return;

    setElText('payPriceSummary', priceStr || '—');
    resetModal();
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Garante que paymentStep visível e authGateStep oculto
    var ag = document.getElementById('authGateStep');
    var ps = document.getElementById('paymentStep');
    if (ag) ag.style.display = 'none';
    if (ps) ps.style.display = '';

    // Gera o PIX imediatamente
    gerarPix();
  };

  // Expõe função interna para o auth gate poder chamar após login
  window._pixDirectOpen = window.openPayModal;

  // ── Fecha modal ─────────────────────────────────────────
  function fecharModal() {
    var modal = document.getElementById('payModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (_timerInterval)  { clearInterval(_timerInterval);  _timerInterval  = null; }
    if (_pollingInterval) { clearInterval(_pollingInterval); _pollingInterval = null; }
    _pixLoading = false;
    _gwConfig = null; // limpa cache para sempre buscar config atualizada
  }

  // ── Reset visual (NÃO toca em _pixLoading) ──────────────
  function resetModal() {
    if (_timerInterval)  { clearInterval(_timerInterval);  _timerInterval  = null; }
    if (_pollingInterval) { clearInterval(_pollingInterval); _pollingInterval = null; }
    var result = document.getElementById('pixResult');
    if (result) result.innerHTML = '';
    setElText('pixStatus', '⏳ Gerando PIX...');
    setElDisplay('pixStatus', '');
    setElDisplay('generatePixBtn', 'none');
  }

  // ── Gera PIX via Netlify Function ───────────────────────
  function gerarPix() {
    if (_pixLoading) return;
    if (!_selectedPrice) { setElText('pixStatus', '❌ Valor inválido.'); return; }

    _pixLoading = true;

    loadGwConfig().then(function (cfg) {
      var gw = cfg.gateway || 'syncpay';

      // Pega o e-mail da conta logada (não o do pagador) para vincular o acesso com segurança
      var buyerEmail = '';
      try {
        var sess = JSON.parse(localStorage.getItem('mbr_session') || '{}');
        buyerEmail = (sess.user && sess.user.email) || (sess.session && sess.session.user && sess.session.user.email) || '';
      } catch (e) {}

      // Valida campos obrigatórios por gateway
      var missing = false;
      if (gw === 'syncpay'  && (!cfg.syncpay_client_id || !cfg.syncpay_client_secret)) missing = true;
      if (gw === 'nexuspag' && !cfg.nexuspag_api_key)                                   missing = true;
      if (gw === 'asaas'    && !cfg.asaas_api_key)                                      missing = true;
      if (gw === 'efibank'  && (!cfg.efibank_client_id || !cfg.efibank_client_secret))  missing = true;
      if (gw === 'primepag' && (!cfg.primepag_client_id || !cfg.primepag_client_secret)) missing = true;

      if (missing) {
        setElText('pixStatus', '❌ Credenciais do gateway não configuradas no painel admin.');
        _pixLoading = false;
        return;
      }

      fetch('/api/pix-cashin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign(
          { amount: _selectedPrice, plan_code: _selectedPlanCode, buyer_email: buyerEmail, gateway: cfg.gateway || 'syncpay', site_url: cfg.site_url || '' },
          cfg // passa todas as credenciais da config (client_id, api_key, etc.)
        )),
      })
        .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
        .then(function(res) {
          _pixLoading = false;
          if (!res.ok || !res.data.ok) {
            setElText('pixStatus', '❌ ' + (res.data.error || 'Erro ao gerar PIX.'));
            setElDisplay('generatePixBtn', '');
            return;
          }
          setElDisplay('pixStatus', 'none');
          renderResult(res.data);

          // ── Inicia polling de confirmação de pagamento ──
          var paymentId = res.data.identifier;
          if (paymentId) {
            startPolling(paymentId);
          }
        })
        .catch(function() {
          _pixLoading = false;
          setElText('pixStatus', '❌ Falha de conexão. Tente novamente.');
          setElDisplay('generatePixBtn', '');
        });
    });
  }

  // ── Polling: verifica se o pagamento foi confirmado ─────
  function startPolling(paymentId) {
    if (_pollingInterval) clearInterval(_pollingInterval);

    var attempts = 0;
    var maxAttempts = 72; // ~6 min (a cada 5s)

    _pollingInterval = setInterval(function () {
      attempts++;

      // Para o polling se o modal foi fechado ou tempo esgotado
      if (attempts > maxAttempts) {
        clearInterval(_pollingInterval);
        _pollingInterval = null;
        return;
      }

      fetch(
        SUPABASE_URL + '/rest/v1/access_tokens?payment_id=eq.' + encodeURIComponent(paymentId) + '&select=token&limit=1',
        { headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON } }
      )
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) {
          if (rows && rows.length && rows[0].token) {
            clearInterval(_pollingInterval);
            _pollingInterval = null;

            // Exibe feedback de sucesso antes de redirecionar
            var result = document.getElementById('pixResult');
            if (result) {
              result.innerHTML =
                '<div style="text-align:center;padding:24px 0;">' +
                  '<div style="font-size:48px;margin-bottom:12px">✅</div>' +
                  '<p style="font-size:16px;font-weight:700;color:var(--accent,#e91e8c);margin:0 0 6px">Pagamento confirmado!</p>' +
                  '<p style="font-size:13px;color:var(--text-dim,#aaa);margin:0">Redirecionando para o conteúdo...</p>' +
                '</div>';
            }
            if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }

            // Redireciona após 1.5s para dar tempo do usuário ver o feedback
            setTimeout(function () {
              window.location.href = '/members.html?token=' + encodeURIComponent(rows[0].token);
            }, 1500);
          }
        })
        .catch(function () { /* silencia erros de rede, tenta novamente */ });
    }, 5000); // consulta a cada 5 segundos
  }

  // ── Renderiza QR + copia e cola ─────────────────────────
  function renderResult(data) {
    var result = document.getElementById('pixResult');
    if (!result) return;

    var html = '';

    if (data.pix_code) {
      var qrSrc = data.qr_code_base64
        ? data.qr_code_base64
        : 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(data.pix_code);
      html += '<div style="width:fit-content;margin:8px auto 14px;padding:12px;border:2px solid #2a3562;border-radius:10px;background:#fff;">';
      html +=   '<img id="pixQrImg" src="' + qrSrc + '" alt="QR Code PIX" style="display:block;width:200px;height:200px;">';
      html += '</div>';
      html += '<textarea id="pixCodigo" readonly style="width:100%;box-sizing:border-box;background:#ffffff;border:1px solid #ddd;border-radius:18px;padding:12px 16px;color:#111111;font-size:11px;font-family:monospace;resize:none;min-height:50px;word-break:break-all;outline:none;text-align:center">' + escHtml(data.pix_code) + '</textarea>';
      html += '<button onclick="pixCopiar()" style="display:block;width:100%;margin-top:10px;padding:13px;background:#f6842c;color:#fff;border:none;border-radius:999px;font-size:15px;font-weight:700;cursor:pointer;">📋 Copiar chave Pix</button>';
    }

    html += '<p id="pixTimer" style="text-align:center;font-size:12px;color:var(--text-dim,#888);margin-top:14px">⏱ Expira em <strong>30:00</strong></p>';
    html += '<p id="pixPollingStatus" style="text-align:center;font-size:11px;color:var(--text-dim,#666);margin-top:6px">🔄 Aguardando confirmação do pagamento...</p>';

    result.innerHTML = html;
    window._pixCode = data.pix_code || '';
    startTimer('pixTimer', 30 * 60);
  }

  // ── Copiar código ───────────────────────────────────────
  window.pixCopiar = function () {
    var code = window._pixCode || '';
    if (!code) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(function () { toast('✅ Código copiado!'); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = code; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta); toast('✅ Código copiado!');
    }
  };

  // ── Timer countdown ─────────────────────────────────────
  function startTimer(elId, seconds) {
    var rem = seconds;
    _timerInterval = setInterval(function () {
      rem--;
      var el = document.getElementById(elId);
      if (rem <= 0) {
        clearInterval(_timerInterval);
        if (_pollingInterval) { clearInterval(_pollingInterval); _pollingInterval = null; }
        if (el) el.innerHTML = '⚠️ Código expirado. Feche e clique no plano novamente.';
        var ps = document.getElementById('pixPollingStatus');
        if (ps) ps.style.display = 'none';
        return;
      }
      var m = String(Math.floor(rem / 60)).padStart(2, '0');
      var s = String(rem % 60).padStart(2, '0');
      if (el) el.innerHTML = '⏱ Expira em <strong>' + m + ':' + s + '</strong>';
    }, 1000);
  }

  // ── Bind eventos ────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    var closeBtn = document.getElementById('payClose');
    var backdrop = document.getElementById('payBackdrop');
    if (closeBtn) closeBtn.addEventListener('click', fecharModal);
    if (backdrop) backdrop.addEventListener('click', fecharModal);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharModal(); });

    // Botão "Tentar novamente"
    var genBtn = document.getElementById('generatePixBtn');
    if (genBtn) {
      genBtn.textContent = '🔄 Tentar novamente';
      genBtn.addEventListener('click', function () {
        _pixLoading = false; // permite nova tentativa explícita
        setElDisplay('generatePixBtn', 'none');
        resetModal();
        gerarPix();
      });
    }

    // Injeta #pixResult e #pixStatus no modal se não existirem
    injectModalStructure();

    // Bind botões de plano removido — onclick já definido inline no HTML
  });

  // ── Injeta estrutura no .pm-body ────────────────────────
  function injectModalStructure() {
    var body = document.querySelector('.pm-body');
    if (!body || document.getElementById('pixResult')) return;

    ['pixKey','copyPix','qrcode','awaitingPrice'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    var genBtn = document.getElementById('generatePixBtn');

    var status = document.createElement('p');
    status.id = 'pixStatus';
    status.style.cssText = 'text-align:center;font-size:13px;color:var(--text-dim,#aaa);margin:16px 0 4px';
    status.textContent = '';

    var result = document.createElement('div');
    result.id = 'pixResult';
    result.style.marginTop = '8px';

    if (genBtn) {
      var insertParent = genBtn.parentNode || body;
      insertParent.insertBefore(status, genBtn);
      insertParent.insertBefore(result, genBtn);
      genBtn.style.display = 'none';
    } else {
      body.appendChild(status);
      body.appendChild(result);
    }
  }

  // ── Helpers ─────────────────────────────────────────────
  function setElText(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
  function setElDisplay(id, v) { var e = document.getElementById(id); if (e) e.style.display = v; }
  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function toast(msg) {
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:12px 22px;border-radius:12px;font-size:14px;z-index:99999;box-shadow:0 4px 24px rgba(0,0,0,.4);pointer-events:none;white-space:nowrap';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2500);
  }
})();
