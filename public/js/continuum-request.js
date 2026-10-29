// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
/**
 * ContinuumRequest — Invent round trip, Forge side (hackathon step 15).
 *
 * Shared by the four Forge build pages (one script tag each; no other
 * wiring needed). When sessionStorage holds a valid Invent challenge, a
 * "Continuum Request" card renders at the top of the page showing only the
 * challenge title and the needed capabilities as function phrases (the same
 * wording as the Continuum role cards). It never shows which mission,
 * parts, fixes, or boost produce them. The dismiss X clears the request.
 * After a save lands while a request is active, showReturnButton() offers
 * the trip back to /continuum.html.
 */
(function () {
  'use strict';

  var KEY = 'continuum.inventChallenge';
  var NEW_KEY = 'continuum.newQbitId';

  function load() {
    try {
      var raw = window.sessionStorage ? sessionStorage.getItem(KEY) : null;
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.id || !data.title) return null;
      if (data.mode !== 'invent') return null;
      if (!Array.isArray(data.roles) || data.roles.length !== 2) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function clear() {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* blocked */ }
  }

  function render() {
    if (document.getElementById('continuumRequest')) return document.getElementById('continuumRequest');
    var data = load();
    if (!data) return null;
    var app = document.getElementById('app');
    if (!app || !app.parentNode) return null;

    var card = document.createElement('div');
    card.id = 'continuumRequest';
    card.setAttribute('role', 'note');
    card.setAttribute('aria-label', 'Continuum Request');
    card.style.cssText = 'position:relative;z-index:10;max-width:720px;margin:14px auto 0 auto;' +
      'background:linear-gradient(135deg,rgba(130,205,240,0.13),rgba(70,130,170,0.1));' +
      'border:1px solid rgba(160,225,255,0.4);border-radius:18px;padding:14px 44px 14px 16px;' +
      'color:#e2e8f0;font:14px/1.5 system-ui,-apple-system,sans-serif;';

    var head = document.createElement('div');
    head.style.cssText = 'font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#7dd3fc;font-weight:700;margin-bottom:4px;';
    head.textContent = 'Continuum Request';
    card.appendChild(head);

    var title = document.createElement('div');
    title.style.cssText = 'font-weight:700;font-size:16px;color:#fff;margin-bottom:6px;';
    title.textContent = String(data.title);
    card.appendChild(title);

    data.roles.forEach(function (role) {
      var line = document.createElement('div');
      line.style.cssText = 'font-size:13px;color:#a0d8ff;margin-top:2px;';
      var label = (role && role.name ? String(role.name) + ': ' : '') +
        (role && typeof role.needs === 'string' ? role.needs : '');
      line.textContent = label;
      card.appendChild(line);
    });

    var x = document.createElement('button');
    x.type = 'button';
    x.setAttribute('aria-label', 'Dismiss Continuum request');
    x.style.cssText = 'position:absolute;top:8px;right:8px;width:28px;height:28px;border:0;border-radius:8px;' +
      'background:transparent;color:#94a3b8;font-size:18px;line-height:1;cursor:pointer;';
    x.textContent = '×';
    x.addEventListener('click', function () {
      clear();
      if (card.parentNode) card.parentNode.removeChild(card);
    });
    card.appendChild(x);

    app.parentNode.insertBefore(card, app);
    return card;
  }

  function showReturnButton() {
    var box = document.getElementById('saveConfirm');
    if (!box || document.getElementById('continuumReturnBtn')) return false;
    var btn = document.createElement('button');
    btn.id = 'continuumReturnBtn';
    btn.type = 'button';
    btn.style.cssText = 'display:block;margin-top:12px;padding:10px 18px;border-radius:999px;cursor:pointer;' +
      'background:rgba(125,211,252,0.15);border:1px solid rgba(125,211,252,0.6);color:#fff;' +
      'font:600 14px system-ui,-apple-system,sans-serif;';
    btn.textContent = 'Return to the Continuum';
    btn.addEventListener('click', function () {
      window.location.href = '/continuum.html';
    });
    box.appendChild(btn);
    return true;
  }

  window.ContinuumRequest = {
    KEY: KEY,
    NEW_KEY: NEW_KEY,
    load: load,
    clear: clear,
    render: render,
    showReturnButton: showReturnButton,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
