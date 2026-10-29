// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
/**
 * The Machine as guide on the Resonance hub (hackathon step 13).
 *
 * LAYOUT RULES: every element created here is position:fixed, appended at
 * the end of <body>, and styled only through the .mg-* classes below. No
 * existing element is resized, repositioned, or altered.
 *
 * Collapsed: a small glowing orb (48px, 44px on mobile), bottom-right,
 * 16px from the right edge and 16px above the footer bar. Expanded: a
 * compact panel (max 320px, max 50vh, internal scroll); on mobile a bottom
 * sheet up to 60% height. The Machine initiates with a speech bubble on
 * first arrival and once per stage change. Replies render via textContent.
 */
(function () {
  'use strict';

  var CSS = [
    '.mg-orb{position:fixed;right:16px;bottom:var(--mg-lift,16px);width:48px;height:48px;border-radius:50%;',
    'z-index:5000;cursor:pointer;padding:0;border:1px solid rgba(125,211,252,.65);',
    'background:radial-gradient(circle at 35% 35%,#164e63,#0d1426 72%);',
    'box-shadow:0 0 14px rgba(125,211,252,.45),inset 0 0 10px rgba(125,211,252,.30);}',
    '.mg-orb::after{content:"";position:absolute;left:16px;top:16px;width:14px;height:14px;border-radius:50%;',
    'background:#7dd3fc;box-shadow:0 0 10px #7dd3fc;}',
    '@media (prefers-reduced-motion:no-preference){.mg-orb{animation:mg-pulse 3.2s ease-in-out infinite;}}',
    '@keyframes mg-pulse{0%,100%{box-shadow:0 0 10px rgba(125,211,252,.35),inset 0 0 10px rgba(125,211,252,.30);}',
    '50%{box-shadow:0 0 20px rgba(125,211,252,.6),inset 0 0 10px rgba(125,211,252,.35);}}',
    '.mg-orb:focus-visible{outline:2px solid #7dd3fc;outline-offset:2px;}',
    '.mg-orb-label{display:none;position:absolute;right:56px;bottom:10px;white-space:nowrap;',
    'font:600 13px system-ui,-apple-system,sans-serif;color:#fff;background:rgba(13,20,38,.95);',
    'border:1px solid #24304d;border-radius:8px;padding:6px 10px;}',
    '.mg-orb:hover .mg-orb-label,.mg-orb:focus-visible .mg-orb-label{display:block;}',
    '.mg-orb-first .mg-orb-label{display:block;}',
    '@media (prefers-reduced-motion:no-preference){.mg-orb-first{animation:mg-first 1s ease-in-out 3;}}',
    '@keyframes mg-first{0%,100%{box-shadow:0 0 10px rgba(125,211,252,.35),inset 0 0 10px rgba(125,211,252,.30);}',
    '50%{box-shadow:0 0 26px rgba(125,211,252,.85),inset 0 0 12px rgba(125,211,252,.5);}}',
    '.mg-bubble{position:fixed;right:76px;bottom:calc(var(--mg-lift,16px) + 8px);max-width:260px;z-index:5001;',
    'font:14px/1.5 system-ui,-apple-system,sans-serif;color:#e2e8f0;background:rgba(13,20,38,.97);',
    'border:1px solid #24304d;border-radius:12px;padding:10px 34px 10px 12px;cursor:pointer;',
    'box-shadow:0 8px 28px rgba(0,0,0,.5);}',
    '.mg-bubble-x{position:absolute;top:4px;right:4px;width:24px;height:24px;border:0;background:transparent;',
    'color:#94a3b8;font-size:15px;line-height:1;cursor:pointer;border-radius:6px;}',
    '.mg-bubble-x:hover{color:#fff;}',
    '.mg-panel{position:fixed;right:16px;bottom:calc(var(--mg-lift,16px) + 60px);width:320px;',
    'max-width:calc(100vw - 32px);max-height:50vh;z-index:5002;display:flex;flex-direction:column;',
    'background:#0d1426;border:1px solid #24304d;border-radius:12px;overflow:hidden;',
    'box-shadow:0 12px 40px rgba(0,0,0,.6);font:14px/1.5 system-ui,-apple-system,sans-serif;color:#fff;}',
    '.mg-panel[hidden],.mg-bubble[hidden],.mg-orb[hidden]{display:none !important;}',
    '.mg-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;',
    'border-bottom:1px solid #24304d;font-weight:700;font-size:15px;}',
    '.mg-head .mg-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#7dd3fc;',
    'box-shadow:0 0 8px #7dd3fc;margin-right:8px;}',
    '.mg-x{border:0;background:transparent;color:#94a3b8;font-size:18px;line-height:1;cursor:pointer;',
    'padding:4px 8px;border-radius:6px;}',
    '.mg-x:hover{color:#fff;}',
    '.mg-body{overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;}',
    '.mg-next{color:#a0d8ff;font-weight:500;}',
    '.mg-reply{color:#e2e8f0;white-space:pre-line;}',
    '.mg-ask{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #24304d;}',
    '.mg-ask input{flex:1;min-width:0;background:#111a2a;border:1px solid #24304d;border-radius:8px;',
    'color:#fff;font:14px system-ui,-apple-system,sans-serif;padding:8px 10px;}',
    '.mg-ask input::placeholder{color:#64748b;}',
    '.mg-ask button{background:rgba(17,26,42,.8);border:1px solid #24304d;border-radius:8px;color:#fff;',
    'font:600 14px system-ui,-apple-system,sans-serif;padding:8px 14px;cursor:pointer;}',
    '.mg-ask button:hover{border-color:#7dd3fc;background:rgba(125,211,252,.1);}',
    '.mg-status{font-size:12px;color:#64748b;}',
    '@media (max-width:600px){',
    '.mg-orb{width:44px;height:44px;}',
    '.mg-orb::after{left:15px;top:15px;width:12px;height:12px;}',
    '.mg-orb-label{right:52px;}',
    '.mg-bubble{left:16px;right:16px;max-width:none;bottom:calc(var(--mg-lift,16px) + 56px);}',
    '.mg-panel{left:0;right:0;bottom:0;width:auto;max-width:none;max-height:60vh;border-radius:12px 12px 0 0;}',
    '}',
    '@media (max-width:768px){',
    '.mg-bubble>span:first-child{display:-webkit-box;-webkit-line-clamp:3;line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}',
    '}'
  ].join('\n');

  var SEEN_KEY = 'machineGuide.seen';
  var STAGE_KEY = 'machineGuide.stage';
  var ORB_SEEN_KEY = 'machineGuide.orbSeen';
  var CHIME_KEY = 'machineGuide.chimed';
  var MISSION_IDS = ['harmonic_tuning', 'entanglement', 'coherence_stitching', 'energy_absorption', 'stealth_masking'];

  function getArchitectId() {
    try {
      if (window.ArchitectID && typeof window.ArchitectID.get === 'function') {
        return window.ArchitectID.get();
      }
    } catch (e) { /* fall through */ }
    try {
      return localStorage.getItem('maigicly_architect_id');
    } catch (e) { return null; }
  }

  function getMissions() {
    var out = [];
    try {
      MISSION_IDS.forEach(function (id) {
        if (localStorage.getItem('mission.' + id + '.complete') === 'true') out.push(id);
      });
    } catch (e) { /* storage blocked: no missions claimed */ }
    return out;
  }

  function pageGuidance() {
    var el = document.getElementById('machineStatus');
    var text = el && el.textContent ? el.textContent.trim() : '';
    return text || 'The Machine cannot be reached right now.';
  }

  // Keep the orb 16px above the footer bar so it never covers footer
  // text (fixed on desktop, static at the page end on narrow screens).
  function updateLift() {
    var footer = document.querySelector('.site-footer');
    var h = footer ? footer.offsetHeight : 0;
    document.documentElement.style.setProperty('--mg-lift', (h + 16) + 'px');
  }

  // One short soft chime, synthesized (no audio file), played once per
  // browser after the player's first tap or click on the page.
  function armChime() {
    function onFirstGesture() {
      var chimed = null;
      try { chimed = localStorage.getItem(CHIME_KEY); } catch (e) { /* blocked */ }
      if (chimed === 'true') return;
      try { localStorage.setItem(CHIME_KEY, 'true'); } catch (e) { /* blocked */ }
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        var ctx = new AC();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 720;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.65);
      } catch (e) { /* audio unavailable: stay silent */ }
    }
    document.addEventListener('pointerdown', onFirstGesture, { once: true });
  }

  function postGuide(architectId, missions, question) {
    var body = { architect_id: architectId, progress: { missions: missions } };
    if (question) body.question = question;
    return fetch('/api/guide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) throw new Error('guide HTTP ' + res.status);
      return res.json();
    });
  }

  function buildDom() {
    var orb = document.createElement('button');
    orb.className = 'mg-orb';
    orb.type = 'button';
    orb.setAttribute('aria-label', 'The Machine: ask for guidance');
    var label = document.createElement('span');
    label.className = 'mg-orb-label';
    label.textContent = 'The Machine';
    orb.appendChild(label);

    var bubble = document.createElement('div');
    bubble.className = 'mg-bubble';
    bubble.hidden = true;
    bubble.setAttribute('role', 'status');
    var bubbleText = document.createElement('span');
    bubble.appendChild(bubbleText);
    var bubbleX = document.createElement('button');
    bubbleX.className = 'mg-bubble-x';
    bubbleX.type = 'button';
    bubbleX.setAttribute('aria-label', 'Dismiss');
    bubbleX.textContent = '×';
    bubble.appendChild(bubbleX);

    var panel = document.createElement('div');
    panel.className = 'mg-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'The Machine');
    var head = document.createElement('div');
    head.className = 'mg-head';
    var title = document.createElement('span');
    var dot = document.createElement('span');
    dot.className = 'mg-dot';
    title.appendChild(dot);
    title.appendChild(document.createTextNode('The Machine'));
    var x = document.createElement('button');
    x.className = 'mg-x';
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.textContent = '×';
    head.appendChild(title);
    head.appendChild(x);
    var body = document.createElement('div');
    body.className = 'mg-body';
    var nextEl = document.createElement('div');
    nextEl.className = 'mg-next';
    var replyEl = document.createElement('div');
    replyEl.className = 'mg-reply';
    var statusEl = document.createElement('div');
    statusEl.className = 'mg-status';
    body.appendChild(nextEl);
    body.appendChild(replyEl);
    body.appendChild(statusEl);
    var form = document.createElement('form');
    form.className = 'mg-ask';
    var input = document.createElement('input');
    input.type = 'text';
    input.name = 'q';
    input.maxLength = 200;
    input.placeholder = 'Ask the Machine';
    input.setAttribute('aria-label', 'Ask the Machine');
    var send = document.createElement('button');
    send.type = 'submit';
    send.textContent = 'Ask';
    form.appendChild(input);
    form.appendChild(send);
    panel.appendChild(head);
    panel.appendChild(body);
    panel.appendChild(form);

    document.body.appendChild(orb);
    document.body.appendChild(bubble);
    document.body.appendChild(panel);
    return { orb, bubble, bubbleText, bubbleX, panel, x, nextEl, replyEl, statusEl, form, input };
  }

  function init() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    updateLift();
    window.addEventListener('resize', updateLift);

    var dom = buildDom();
    var state = { nextStep: '', reply: '', stage: '' };
    var bubbleTimer = null;

    function showBubble(text) {
      if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
      dom.bubbleText.textContent = text;
      dom.bubble.hidden = false;
      // Step 16: the greeting bubble auto-hides after 8 seconds on all
      // screens; tapping the orb still opens the panel.
      bubbleTimer = setTimeout(function () {
        bubbleTimer = null;
        dom.bubble.hidden = true;
      }, 8000);
    }

    function hideBubble() {
      if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
      dom.bubble.hidden = true;
    }

    // First orb appearance in this browser: pulse about 3 cycles and show
    // the label for 4 seconds. The pulse is motion-gated in CSS.
    (function firstAppearance() {
      var orbSeen = null;
      try { orbSeen = localStorage.getItem(ORB_SEEN_KEY); } catch (e) { /* blocked */ }
      if (orbSeen === 'true') return;
      try { localStorage.setItem(ORB_SEEN_KEY, 'true'); } catch (e) { /* blocked */ }
      dom.orb.classList.add('mg-orb-first');
      setTimeout(function () { dom.orb.classList.remove('mg-orb-first'); }, 4000);
    })();
    armChime();

    function render() {
      dom.nextEl.textContent = state.nextStep || pageGuidance();
      dom.replyEl.textContent = state.reply;
      dom.replyEl.style.display = state.reply ? '' : 'none';
    }

    function openPanel() {
      hideBubble();
      dom.panel.hidden = false;
      render();
    }
    function closePanel() {
      dom.panel.hidden = true;
    }

    dom.orb.addEventListener('click', function () {
      if (dom.panel.hidden) openPanel();
      else closePanel();
    });
    dom.x.addEventListener('click', closePanel);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !dom.panel.hidden) closePanel();
    });
    dom.bubbleX.addEventListener('click', function (ev) {
      ev.stopPropagation();
      hideBubble();
    });
    dom.bubble.addEventListener('click', openPanel);

    dom.form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var q = dom.input.value.trim().slice(0, 200);
      if (!q) return;
      dom.input.value = '';
      dom.statusEl.textContent = 'Consulting the Machine…';
      var id = getArchitectId();
      if (!id) {
        dom.statusEl.textContent = '';
        dom.replyEl.style.display = '';
        dom.replyEl.textContent = pageGuidance();
        return;
      }
      postGuide(id, getMissions(), q).then(function (out) {
        state.nextStep = out.nextStep || '';
        state.reply = out.reply || '';
        state.stage = out.stage || state.stage;
        dom.statusEl.textContent = '';
        render();
      }).catch(function () {
        dom.statusEl.textContent = '';
        dom.replyEl.style.display = '';
        dom.replyEl.textContent = pageGuidance();
      });
    });

    // The Machine initiates: greeting on first arrival, and a short bubble
    // once when the stage changes.
    var id = getArchitectId();
    if (!id) {
      state.nextStep = pageGuidance();
      return;
    }
    var seen = null;
    var prevStage = null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
      prevStage = localStorage.getItem(STAGE_KEY);
    } catch (e) { /* storage blocked */ }
    postGuide(id, getMissions(), '').then(function (out) {
      state.nextStep = out.nextStep || '';
      state.reply = out.reply || '';
      state.stage = out.stage || '';
      try {
        if (seen !== 'true') {
          localStorage.setItem(SEEN_KEY, 'true');
          if (state.stage) localStorage.setItem(STAGE_KEY, state.stage);
          if (state.reply) {
            showBubble(state.reply);
          }
        } else if (state.stage && prevStage && state.stage !== prevStage) {
          localStorage.setItem(STAGE_KEY, state.stage);
          showBubble(state.reply || state.nextStep);
        } else if (state.stage && !prevStage) {
          localStorage.setItem(STAGE_KEY, state.stage);
        }
      } catch (e) { /* storage blocked: orb still works */ }
      if (!dom.panel.hidden) render();
      updateLift();
    }).catch(function () {
      state.nextStep = pageGuidance();
      if (!dom.panel.hidden) render();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
