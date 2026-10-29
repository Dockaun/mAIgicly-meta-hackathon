(function () {
  'use strict';

  // ── Completion flags — unchanged ──────────────────────────────────────────
  var NODE_FLAGS = {
    spark:   'violetflicker.v3.complete',
    split:   'refrax.v3.complete',
    steer:   'magnetica.v3.complete',
    sync:    'chrona.v3.complete',
    align:   'mission.harmonic_tuning.complete',
    link:    'mission.entanglement.complete',
    hold:    'mission.coherence_stitching.complete',
    absorb:  'mission.energy_absorption.complete',
    protect: 'mission.stealth_masking.complete'
  };

  var NODES = [
    { id: 'spark',   name: 'Violet Flicker',      color: '#7c3aed',              role: 'Starts the machine — opens the first possibility',             link: '/chambers/violetflicker.html',            guardian: true,  voice: 'I start it. Without my spark the machine can\u2019t open even one possibility.' },
    { id: 'split',   name: 'Refrax',              color: '#06b6d4',              role: 'Opens all paths simultaneously',                               link: '/chambers/refrax.html',                   guardian: true,  voice: 'I open all the possibilities at once. Billions of them, simultaneously.' },
    { id: 'steer',   name: 'Magnetica',           color: '#ef4444', colorB: '#3b82f6', role: 'Guides each possibility down the right path',           link: '/chambers/magnetica.html',                guardian: true,  voice: 'I guide each possibility down the right path so none get lost.' },
    { id: 'sync',    name: 'Chrona',              color: '#f59e0b',              role: 'Keeps perfect timing across all paths',                        link: '/chambers/chrona.html',                   guardian: true,  voice: 'I keep all those simultaneous possibilities on the same beat so they can be compared.' },
    { id: 'align',   name: 'Harmonic Tuning',     color: '#10b981',              role: 'Makes billions of signals agree into one output',              link: '/forge.html?mission=harmonic_tuning',     guardian: false, voice: 'I make billions of signals agree so the machine isn\u2019t just generating noise.' },
    { id: 'link',    name: 'Entanglement',        color: '#14b8a6',              role: 'Connects distant parts so they share discoveries instantly',   link: '/forge.html?mission=entanglement',         guardian: false, voice: 'I connect distant parts so they share what they\u2019re finding \u2014 instantly.' },
    { id: 'hold',    name: 'Coherence Stitching', color: '#94a3b8',              role: 'Keeps possibilities from drifting apart',                      link: '/forge.html?mission=coherence_stitching',  guardian: false, voice: 'I keep all those possibilities from drifting apart before the best one emerges.' },
    { id: 'absorb',  name: 'Energy Absorption',   color: '#f97316',              role: 'Tames the energy from simultaneous paths',                    link: '/forge.html?mission=energy_absorption',    guardian: false, voice: 'I catch the energy that billions of simultaneous paths generate \u2014 or they\u2019d destroy the machine.' },
    { id: 'protect', name: 'Stealth Masking',     color: '#8b5cf6',              role: 'Shields the final answer from corruption',                    link: '/forge.html?mission=stealth_masking',      guardian: false, voice: 'I shield the answer as it travels out so nothing corrupts it before it arrives.' }
  ];

  // ── State readers — unchanged ─────────────────────────────────────────────
  function isNodeOnline(id) {
    if (id === 'answer') return NODES.every(function (n) { return isNodeOnline(n.id); });
    var flag = NODE_FLAGS[id];
    if (!flag) return false;
    try { return localStorage.getItem(flag) === 'true'; } catch (e) { return false; }
  }

  function getOnlineCount() {
    return NODES.filter(function (n) { return isNodeOnline(n.id); }).length;
  }

  function isForgeUnlocked() {
    try { return window.GlobalPoints ? window.GlobalPoints.canUnlockForge() : false; } catch (e) { return false; }
  }

  // ── Story label ───────────────────────────────────────────────────────────
  function getStoryLabel(count) {
    if (count >= 9)  return 'The Machine is online. Your Qbit system is beginning to take form.';
    if (count >= 5)  return 'The Forge is active. ' + count + ' of 9 Qbits online. The system is learning your patterns.';
    if (count === 4) return 'Four Guardians restored. Enter the Forge to shape the remaining Qbits.';
    return 'The Machine is dark. Restore the 4 Guardians to bring it back online.';
  }

  // ── Progress button color state ───────────────────────────────────────────
  function getProgressStyle(count) {
    if (count === 0) return { bg: 'rgba(51,65,85,0.5)',    border: 'rgba(100,116,139,0.25)', text: '#64748b', glow: 'none',                           anim: 'sysmap-pulse-dim 3s ease-in-out infinite' };
    if (count <= 3)  return { bg: 'rgba(34,211,238,0.08)', border: 'rgba(34,211,238,0.3)',   text: '#67e8f9', glow: '0 0 10px rgba(34,211,238,0.2)',   anim: '' };
    if (count === 4) return { bg: 'rgba(6,182,212,0.18)',  border: 'rgba(6,182,212,0.55)',   text: '#06b6d4', glow: '0 0 14px rgba(6,182,212,0.45)',   anim: '' };
    if (count <= 8)  return { bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.5)',   text: '#fbbf24', glow: '0 0 14px rgba(245,158,11,0.38)',  anim: '' };
    return               { bg: 'rgba(34,197,94,0.14)',  border: 'rgba(34,197,94,0.5)',    text: '#4ade80', glow: '0 0 14px rgba(34,197,94,0.45)',   anim: '' };
  }

  // ── 3×3 Qbit grid (also exposed as public API) ───────────────────────────
  function buildGrid() {
    var forgeUnlocked = isForgeUnlocked();

    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:10px;width:100%;max-width:640px;margin:0 auto;';

    NODES.forEach(function (node) {
      var online = isNodeOnline(node.id);
      var locked = !node.guardian && !forgeUnlocked && !online;
      var barBg  = node.colorB
        ? 'linear-gradient(90deg,' + node.color + ',' + node.colorB + ')'
        : node.color;

      var card = document.createElement('div');
      card.style.cssText = [
        'border-radius:10px;padding:12px 10px 10px;text-align:center;position:relative;overflow:hidden;',
        'border:1px solid ' + (online ? node.color : locked ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.1)') + ';',
        'background:' + (online ? 'rgba(255,255,255,0.12)' : locked ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)') + ';',
        'box-shadow:' + (online ? '0 0 22px ' + node.color + '44,inset 0 0 14px ' + node.color + '18' : 'none') + ';',
        'transition:box-shadow .2s,border-color .2s;'
      ].join('');

      var topBar = document.createElement('div');
      topBar.style.cssText = 'position:absolute;top:0;left:0;right:0;height:3px;background:' + barBg + ';opacity:' + (online ? '1' : locked ? '0.12' : '0.35') + ';';
      card.appendChild(topBar);

      var nameEl = document.createElement('div');
      nameEl.textContent = node.name;
      nameEl.style.cssText = 'font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin:9px 0 5px;color:#ffffff;';
      card.appendChild(nameEl);

      var roleEl = document.createElement('div');
      roleEl.textContent = node.role;
      roleEl.style.cssText = 'font-size:9px;line-height:1.45;color:' + (locked ? '#475569' : '#cbd5e1') + ';margin-bottom:6px;';
      card.appendChild(roleEl);

      var voiceEl = document.createElement('div');
      voiceEl.textContent = '\u201c' + node.voice + '\u201d';
      voiceEl.style.cssText = 'font-size:9px;line-height:1.5;font-style:italic;color:' + (locked ? '#374151' : '#94a3b8') + ';margin-bottom:9px;padding:0 2px;';
      card.appendChild(voiceEl);

      var statusEl = document.createElement('div');
      statusEl.textContent = online ? 'Online' : locked ? 'Locked' : 'Dark';
      statusEl.style.cssText = 'font-size:8px;letter-spacing:0.14em;text-transform:uppercase;color:' + (online ? node.color : locked ? '#374151' : '#64748b') + ';margin-bottom:8px;font-weight:600;';
      card.appendChild(statusEl);

      if (!locked) {
        var btn = document.createElement('a');
        btn.href = node.link;
        btn.textContent = online ? 'Restored' : 'Enter';
        btn.style.cssText = [
          'display:inline-block;padding:5px 14px;border-radius:5px;font-size:9px;',
          'letter-spacing:0.1em;text-transform:uppercase;text-decoration:none;font-weight:600;',
          online
            ? 'background:rgba(255,255,255,0.08);color:' + node.color + ';border:1px solid ' + node.color + '66;cursor:default;pointer-events:none;'
            : 'background:rgba(255,255,255,0.12);color:#ffffff;border:1px solid rgba(255,255,255,0.5);'
        ].join('');
        card.appendChild(btn);
      } else {
        var lockEl = document.createElement('div');
        lockEl.textContent = 'Forge to unlock';
        lockEl.style.cssText = 'font-size:8px;color:#475569;letter-spacing:0.07em;text-transform:uppercase;';
        card.appendChild(lockEl);
      }

      grid.appendChild(card);
    });

    return grid;
  }

  // ── Full-screen overlay ───────────────────────────────────────────────────
  function openOverlay() {
    if (document.getElementById('sysmap-overlay')) return;
    var count = getOnlineCount();

    var overlay = document.createElement('div');
    overlay.id = 'sysmap-overlay';
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,0.97);',
      'display:flex;flex-direction:column;align-items:center;',
      'overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px 14px 52px;',
      'animation:sysmap-fadein .2s ease;'
    ].join('');

    var closeRow = document.createElement('div');
    closeRow.style.cssText = 'width:100%;max-width:640px;display:flex;justify-content:flex-end;margin-bottom:6px;';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close map');
    closeBtn.style.cssText = 'background:transparent;border:none;color:rgba(255,255,255,0.3);font-size:18px;cursor:pointer;padding:6px 10px;font-family:ui-monospace,monospace;line-height:1;';
    closeBtn.addEventListener('click', function () { overlay.remove(); });
    closeRow.appendChild(closeBtn);
    overlay.appendChild(closeRow);

    var lbl = document.createElement('div');
    lbl.textContent = 'QUANTUM SYSTEM MAP';
    lbl.style.cssText = 'font-size:10px;letter-spacing:0.3em;color:#94a3b8;margin-bottom:8px;text-align:center;text-transform:uppercase;';
    overlay.appendChild(lbl);

    var story = document.createElement('p');
    story.textContent = getStoryLabel(count);
    story.style.cssText = 'font-size:14px;color:#e2e8f0;text-align:center;max-width:480px;margin:0 0 20px;line-height:1.65;';
    overlay.appendChild(story);

    overlay.appendChild(buildGrid());

    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // ── Compact floating progress button ────────────────────────────────────
  function buildProgressButton(count) {
    var s = getProgressStyle(count);
    var btn = document.createElement('button');
    btn.id = 'sysmap-progress-btn';
    btn.textContent = count + '/9 Qbits online';
    btn.style.cssText = [
      'position:fixed;bottom:16px;right:16px;z-index:9000;',
      'padding:7px 15px;border-radius:20px;',
      'border:1px solid ' + s.border + ';',
      'background:' + s.bg + ';color:' + s.text + ';',
      'box-shadow:' + s.glow + ';',
      'font-family:ui-monospace,monospace;font-size:11px;letter-spacing:0.07em;',
      'cursor:pointer;transition:box-shadow .2s,border-color .2s;',
      'backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);',
      s.anim ? 'animation:' + s.anim + ';' : ''
    ].join('');
    btn.addEventListener('click', openOverlay);
    return btn;
  }

  // Update .sysmap-header-btn elements placed by chamber headers
  function updateHeaderBtns(count) {
    var s = getProgressStyle(count);
    var btns = document.querySelectorAll('.sysmap-header-btn');
    btns.forEach(function (el) {
      el.textContent = count + '/9 Qbits online';
      el.style.color       = s.text;
      el.style.borderColor = s.border;
      el.style.boxShadow   = s.glow;
    });
  }

  // ── CSS ───────────────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('sysmap-css')) return;
    var s = document.createElement('style');
    s.id = 'sysmap-css';
    s.textContent = [
      '@keyframes sysmap-fadein{from{opacity:0}to{opacity:1}}',
      '@keyframes sysmap-pulse-dim{0%,100%{opacity:.5}50%{opacity:.85}}',
      '#sysmap-milestone{position:fixed;bottom:58px;left:50%;transform:translateX(-50%);',
        'z-index:9001;background:rgba(2,10,30,.96);border:1px solid rgba(255,255,255,.09);',
        'border-radius:10px;padding:10px 18px;font-family:ui-monospace,monospace;',
        'font-size:11px;color:#c7d2e0;max-width:380px;text-align:center;width:88%;',
        'opacity:0;transition:opacity .4s;pointer-events:none;}',
      '#sysmap-overlay::-webkit-scrollbar{width:4px;}',
      '#sysmap-overlay::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px;}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── Milestone toast ───────────────────────────────────────────────────────
  function showMilestone(msg) {
    var el = document.getElementById('sysmap-milestone');
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.style.opacity = '0'; }, 7000);
  }

  // ── First-visit intro overlay (new copy) ─────────────────────────────────
  function showIntro() {
    var overlay = document.createElement('div');
    overlay.id = 'sysmap-intro-overlay';
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:9800;background:rgba(0,2,10,0.98);',
      'display:flex;align-items:center;justify-content:center;padding:28px;',
      'animation:sysmap-fadein .7s ease;'
    ].join('');

    overlay.innerHTML = [
      '<div style="max-width:460px;text-align:center;">',
        '<div style="font-size:13px;letter-spacing:0.15em;color:#94a3b8;',
          'text-transform:uppercase;margin-bottom:34px;">',
          'Quantum System',
        '</div>',
        '<p style="margin:0 0 38px;">',
          '<span style="display:block;font-size:28px;font-weight:600;color:#ffffff;',
            'line-height:1.3;margin-bottom:12px;">',
            'For the quantum dreamers:',
          '</span>',
          '<span style="display:block;font-size:20px;font-weight:400;color:#e0f2fe;',
            'line-height:1.5;">',
            'everything in the universe is possible&nbsp;&mdash;<br>',
            'place your attention<br>',
            'and watch it take form.',
          '</span>',
        '</p>',
        '<button id="sysmap-intro-btn" style="',
          'display:block;width:100%;max-width:260px;margin:0 auto 18px;',
          'background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.18);',
          'color:#e2e8f0;padding:14px 0;border-radius:8px;font-size:16px;font-weight:600;',
          'letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;">',
          'BEGIN RESTORATION',
        '</button>',
        '<a id="sysmap-intro-skip" href="#" style="',
          'font-size:13px;font-weight:400;color:#64748b;text-decoration:none;',
          'letter-spacing:0.04em;">',
          'I\'ve been here before',
        '</a>',
      '</div>'
    ].join('');

    document.body.appendChild(overlay);

    function dismiss() {
      overlay.style.transition = 'opacity .4s';
      overlay.style.opacity = '0';
      setTimeout(function () { overlay.remove(); }, 420);
    }

    document.getElementById('sysmap-intro-btn').addEventListener('click', dismiss);
    document.getElementById('sysmap-intro-skip').addEventListener('click', function (e) {
      e.preventDefault();
      dismiss();
    });
  }

  // ── Milestone messages — unchanged ────────────────────────────────────────
  function maybeShowMilestone(count) {
    var msg = null;
    if (count === 4) msg = 'Four Guardians restored. The machine is partially alive. Enter the Forge to build the remaining 5 nodes.';
    else if (count === 9) msg = 'All systems online. Others worked on this alongside you. Enter the Continuum to meet them.';
    if (msg) setTimeout(function () { showMilestone(msg); }, 1400);

    // My Forge milestone hidden for hackathon build — never show.
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    injectCSS();

    var milestone = document.createElement('div');
    milestone.id = 'sysmap-milestone';
    document.body.appendChild(milestone);

    var count = getOnlineCount();
    // Forge uses its own layout — suppress the floating badge there
    var isForge = window.location.pathname.includes('/forge') ||
                  document.title.toLowerCase().includes('forge');
    if (!isForge && !document.querySelector('.sysmap-header-btn')) {
      document.body.appendChild(buildProgressButton(count));
    }
    updateHeaderBtns(count);

    try {
      maybeShowMilestone(count);
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.SysMap = {
    buildGrid:      buildGrid,
    getOnlineCount: getOnlineCount,
    getStoryLabel:  getStoryLabel,
    isNodeOnline:   isNodeOnline,
    openOverlay:    openOverlay
  };

})();
