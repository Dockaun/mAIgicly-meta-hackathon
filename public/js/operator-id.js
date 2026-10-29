// © 2026 mAIgicly. All rights reserved.
(function() {
  'use strict';

  const STORAGE_KEY = 'operator_id';
  const CONFIRMED_KEY = 'operator_id_confirmed';
  const RESTORED_KEY = 'operator_id_restored';
  const WORDS = [
    'APEX','ARC','AXIOM','BEACON','BLAZE','BLOOM','BOLT','BRIDGE','BURST',
    'CACHE','CATALYST','CIPHER','CIRCUIT','COIL','CORE','CORONA','CREST',
    'DELTA','DOME','DRIFT','ECHO','EDGE','EMBER','FLUX','FORGE','FRACTAL',
    'GATE','GLYPH','GRID','GROVE','HAVEN','HELIX','HUB','HUSK',
    'IOTA','ION','IRIS','KAPPA','KEEN','KNOT','LANCE','LATTICE','LAYER',
    'LENS','LINK','LOOM','LUMEN','LYRA','MAST','MATRIX','MESH','MIRROR',
    'NEXUS','NODE','NOVA','NULL','ORBIT','PEAK','PHASE','PILOT','PIXEL',
    'PLANE','PLUME','PRISM','PROBE','PULSE','QUARK','QUILL','RELAY',
    'RIFT','RING','RUNE','SCALE','SHARD','SHIFT','SIGMA','SIGNAL',
    'SPARK','SPIRE','SPLIT','STACK','STEM','STRAND','STREAM','SURGE',
    'THETA','TIDE','TRACE','TRACK','TRINE','TWIST','UNIT','VALE','VANE',
    'VAULT','VEIL','VEIN','VERTEX','VOID','VOLT','VORTEX','WAVE','WEAVE',
    'WIRE','XENON','ZERO','ZONE'
  ];

  function generate() {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    const digits = Math.floor(1000 + Math.random() * 90000).toString().slice(0, 4 + (Math.random() < 0.5 ? 1 : 0));
    return word + ' ' + digits;
  }

  function get() {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = generate();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  // normalizeCode: case-insensitive, extra spaces ignored ("strand  1534" ->
  // "STRAND 1534"). Used by the typed-confirmation gate and by restore lookup.
  function normalizeCode(raw) {
    return String(raw || '').trim().toUpperCase().replace(/\s+/g, ' ');
  }

  function codesMatch(a, b) {
    const left = normalizeCode(a);
    return left.length > 0 && left === normalizeCode(b);
  }

  function isConfirmed() {
    try { return localStorage.getItem(CONFIRMED_KEY) === 'true'; } catch (e) { return false; }
  }

  function isRestored() {
    try { return localStorage.getItem(RESTORED_KEY) === 'true'; } catch (e) { return false; }
  }

  function markConfirmed() {
    try { localStorage.setItem(CONFIRMED_KEY, 'true'); } catch (e) {}
  }

  function markRestored() {
    try { localStorage.setItem(RESTORED_KEY, 'true'); } catch (e) {}
  }

  function currentArchitectId() {
    try {
      return (window.ArchitectID && window.ArchitectID.get && window.ArchitectID.get())
        || localStorage.getItem('maigicly_architect_id')
        || null;
    } catch (e) { return null; }
  }

  function sync(architectId) {
    if (!architectId) return Promise.resolve();
    const id = get();
    return fetch('/api/operator-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator_id: id, architect_id: architectId })
    })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      // If server found a different stored ID for this architect, reconcile localStorage
      if (data?.reconciled && data.operator_id && data.operator_id !== id) {
        localStorage.setItem(STORAGE_KEY, data.operator_id);
      }
    })
    .catch(() => {});
  }

  function confirm(architectId) {
    const id = get();
    return fetch('/api/operator-id/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator_id: id, architect_id: architectId })
    }).catch(() => {});
  }

  function lookup(rawId) {
    const id = normalizeCode(rawId);
    return fetch('/api/operator-id/' + encodeURIComponent(id))
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);
  }

  // syncProgress(flags): best-effort upload of unlock/points flags for restore.
  function syncProgress(flags) {
    const architectId = currentArchitectId();
    if (!architectId || !flags) return Promise.resolve({ ok: false });
    return fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ architect_id: architectId, flags: flags })
    })
    .then(r => r.ok ? r.json() : { ok: false })
    .catch(() => ({ ok: false }));
  }

  // fetchProgress(): download unlock/points flags (restore flow).
  function fetchProgress(architectId) {
    const aid = architectId || currentArchitectId();
    if (!aid) return Promise.resolve({});
    return fetch('/api/progress?architect_id=' + encodeURIComponent(aid))
      .then(r => r.ok ? r.json() : null)
      .then(data => (data && data.flags) || {})
      .catch(() => ({}));
  }

  function copyText(text, done) {
    function finish(ok) { if (done) done(ok); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => finish(true), () => finish(false));
      return;
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      finish(true);
    } catch (e) { finish(false); }
  }

  // showSaveGate({architectId, onConfirmed}): one-time full-screen
  // save-your-code gate for new players. View 1 shows the code with a Copy
  // button and "I wrote it down"; view 2 hides the code and asks the player
  // to type it. Already-confirmed or restored players skip straight to
  // onConfirmed. No personal data is collected: the code only.
  function showSaveGate(opts) {
    const options = opts || {};
    const onConfirmed = typeof options.onConfirmed === 'function' ? options.onConfirmed : function() {};
    const architectId = options.architectId || currentArchitectId();

    if (isConfirmed() || isRestored()) {
      onConfirmed();
      return;
    }
    if (document.getElementById('operatorSaveOverlay')) return;
    const id = get();
    // Persist immediately on reveal — don't wait for player to confirm
    if (architectId) sync(architectId);

    const overlay = document.createElement('div');
    overlay.id = 'operatorSaveOverlay';
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:10001;display:flex;align-items:center;justify-content:center;',
      'background:rgba(0,0,0,0.94);backdrop-filter:blur(8px);'
    ].join('');

    overlay.innerHTML = `
      <div style="
        background:#08101e;
        border:1px solid rgba(87,211,255,0.35);
        border-radius:16px;
        padding:36px 40px;
        max-width:480px;
        width:92%;
        text-align:center;
        box-shadow:0 0 60px rgba(87,211,255,0.15);
        font-family:'Share Tech Mono',monospace;
      ">
        <div style="font-size:0.58rem;letter-spacing:0.38em;color:rgba(87,211,255,0.55);margin-bottom:18px;">
          SAVE YOUR CODE
        </div>
        <div id="opSaveView1">
          <div style="
            font-size:2.4rem;letter-spacing:0.12em;color:#57d3ff;margin:0 0 20px;
            text-shadow:0 0 24px rgba(87,211,255,0.55);font-weight:400;
          ">${id}</div>
          <div style="font-size:0.78rem;color:rgba(255,255,255,0.72);line-height:1.75;margin-bottom:24px;font-family:'Rajdhani',sans-serif;">
            This is your Operator Code. Write it down now. It is the only way to get your Qbits and progress back on another device or after clearing your browser. No email or password.
          </div>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            <button id="opSaveCopyBtn" style="
              background:rgba(87,211,255,0.1);border:1px solid rgba(87,211,255,0.35);
              color:#57d3ff;padding:10px 18px;border-radius:8px;cursor:pointer;
              font-family:'Share Tech Mono',monospace;font-size:0.65rem;letter-spacing:0.14em;
            ">COPY CODE</button>
            <button id="opSaveWroteBtn" style="
              background:#57d3ff;border:none;color:#000b1e;padding:10px 24px;
              border-radius:8px;cursor:pointer;font-weight:700;
              font-family:'Share Tech Mono',monospace;font-size:0.65rem;letter-spacing:0.14em;
            ">I WROTE IT DOWN</button>
          </div>
        </div>
        <div id="opSaveView2" style="display:none;">
          <div style="font-size:0.78rem;color:rgba(255,255,255,0.72);line-height:1.7;margin-bottom:16px;font-family:'Rajdhani',sans-serif;">
            Type your Operator Code to continue.
          </div>
          <input id="opSaveInput" type="text" autocomplete="off" spellcheck="false"
            placeholder="WORD 1234"
            style="
              width:100%;background:rgba(0,0,0,0.4);border:1px solid rgba(87,211,255,0.3);
              color:#57d3ff;padding:12px 14px;border-radius:8px;margin-bottom:10px;
              font-family:'Share Tech Mono',monospace;font-size:1.1rem;letter-spacing:0.12em;
              text-align:center;outline:none;text-transform:uppercase;box-sizing:border-box;
            "
          />
          <p id="opSaveError" style="
            min-height:1.1em;font-size:0.68rem;margin:0 0 12px;
            color:#f87171;font-family:'Rajdhani',sans-serif;letter-spacing:0.03em;
          "></p>
          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            <button id="opSaveBackBtn" style="
              background:transparent;border:none;color:rgba(87,211,255,0.7);
              padding:10px 12px;cursor:pointer;text-decoration:underline;
              font-family:'Share Tech Mono',monospace;font-size:0.62rem;letter-spacing:0.1em;
            ">SHOW MY CODE AGAIN</button>
            <button id="opSaveConfirmBtn" style="
              background:#57d3ff;border:none;color:#000b1e;padding:10px 24px;
              border-radius:8px;cursor:pointer;font-weight:700;
              font-family:'Share Tech Mono',monospace;font-size:0.65rem;letter-spacing:0.14em;
            ">CONTINUE</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const view1 = document.getElementById('opSaveView1');
    const view2 = document.getElementById('opSaveView2');
    const input = document.getElementById('opSaveInput');
    const errEl = document.getElementById('opSaveError');

    function showView(which) {
      errEl.textContent = '';
      if (which === 1) {
        view1.style.display = '';
        view2.style.display = 'none';
      } else {
        view1.style.display = 'none';
        view2.style.display = '';
        input.value = '';
        setTimeout(() => input.focus(), 60);
      }
    }

    document.getElementById('opSaveCopyBtn').addEventListener('click', function() {
      const btn = this;
      copyText(id, function(ok) {
        btn.textContent = ok ? 'COPIED!' : 'COPY FAILED';
        setTimeout(() => { btn.textContent = 'COPY CODE'; }, 2200);
      });
    });

    document.getElementById('opSaveWroteBtn').addEventListener('click', function() {
      showView(2);
    });

    document.getElementById('opSaveBackBtn').addEventListener('click', function() {
      showView(1);
    });

    function doConfirm() {
      if (codesMatch(input.value, id)) {
        markConfirmed();
        if (architectId) confirm(architectId);
        overlay.remove();
        onConfirmed();
      } else {
        errEl.textContent = 'Not quite. Check what you wrote.';
        input.select();
      }
    }

    document.getElementById('opSaveConfirmBtn').addEventListener('click', doConfirm);
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') doConfirm(); });
  }

  function init() {
    get();
    // Try immediately — covers pages where architect-id.js is already loaded
    const architectId = currentArchitectId();
    if (architectId) {
      sync(architectId);
      return;
    }
    // Poll up to 3 s for architect_id to become available (deferred scripts, async init)
    let attempts = 0;
    const poll = setInterval(function() {
      attempts++;
      const aid = currentArchitectId();
      if (aid) {
        clearInterval(poll);
        sync(aid);
      } else if (attempts >= 60) {
        clearInterval(poll);
      }
    }, 50);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  window.OperatorID = {
    get, generate, sync, confirm, lookup,
    normalizeCode, codesMatch,
    isConfirmed, isRestored, markConfirmed, markRestored,
    syncProgress, fetchProgress, showSaveGate
  };
})();
