// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
/**
 * mAIgicly Analytics
 *
 * Identity model
 * ──────────────
 *   architect_id  Canonical player identity — sourced exclusively from architect-id.js.
 *                 Never substituted with anon_id. Null until identity resolves.
 *   anon_id       Analytics-generated UUID — a separate field, always present.
 *   session_id    Per-tab UUID stored in sessionStorage.
 *
 * Deterministic initialisation
 * ─────────────────────────────
 *   analytics.js always loads BEFORE architect-id.js on every page.
 *   The shared deferred window.__maigiclyArchitectId (set here if not already set)
 *   lets architect-id.js push its result to analytics.js the moment it runs.
 *
 * Pre-identity queue
 * ──────────────────
 *   Events that call track() before identity resolves are held in _preIdentityQueue
 *   (in-memory only). On identity resolution they are enriched with the canonical
 *   architect_id and flushed in order.
 *
 * Session-start deduplication
 * ────────────────────────────
 *   Guarded by a sessionStorage flag keyed to the current session_id.
 *   Prevents duplicate session_start on hot-reloads, back-navigation, or if
 *   initializeSession() is called more than once.
 *
 * Diagnostic fields on every event
 * ──────────────────────────────────
 *   _identity_source  'existing' | 'new' | 'memory_fallback' | 'unavailable' | 'pending'
 *   _anon_id          the analytics-generated UUID (separate from architect_id)
 *   _send_method      'fetch' | 'beacon' | 'queued' | 'pre_identity_queue'
 */

// Shared deferred — initialised here so analytics.js can subscribe before architect-id.js loads.
window.__maigiclyArchitectId = window.__maigiclyArchitectId || { result: null, waiters: [] };

(function () {
  'use strict';

  var ANALYTICS_ENABLED  = true;
  var TRACK_ENDPOINT     = '/api/track-event';
  var USER_ID_KEY        = 'maigicly_user_id';
  var SESSION_ID_KEY     = 'maigicly_session_id_v2';
  var FIRST_TOUCH_KEY    = 'maigicly_first_touch';
  var QUEUE_KEY          = 'maigicly_event_queue';
  var SESSION_START_KEY  = 'maigicly_session_start_fired';
  var IDENTITY_TIMEOUT   = 2000; // ms to wait for architect-id.js before giving up

  // ── Identity state ────────────────────────────────────────────────────────────
  var _canonicalId       = null;   // set once when architect-id.js resolves (may remain null if unavailable)
  var _identitySource    = 'pending';
  var _identityResolved  = false;  // true once initializeSession() has run — unblocks track()
  var _preIdentityQueue  = [];     // in-memory; drained after identity resolves
  var _sessionStartFired = false;

  // ── Deferred identity subscriber ─────────────────────────────────────────────
  // Returns a Promise<{ id, source }> regardless of which script loaded first.
  function waitForCanonicalId() {
    var g = window.__maigiclyArchitectId;
    if (g.result) return Promise.resolve(g.result);
    return new Promise(function (resolve) {
      g.waiters.push(resolve);
    });
  }

  // ── UUID ──────────────────────────────────────────────────────────────────────
  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ── Safe storage (in-app browsers can throw SecurityError) ───────────────────
  function safeGet(storage, key) { try { return storage.getItem(key); } catch (e) { return null; } }
  function safeSet(storage, key, val) { try { storage.setItem(key, val); } catch (e) {} }

  var _memUserId = null, _memSessionId = null;

  // anon_id — analytics-generated UUID, always available, always a separate field
  function getUserHash() {
    var uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    var id = safeGet(localStorage, USER_ID_KEY) || _memUserId;
    if (!id || !uuidRe.test(id)) {
      id = generateUUID();
      safeSet(localStorage, USER_ID_KEY, id);
      _memUserId = id;
    }
    return id;
  }

  function getSessionId() {
    var id = safeGet(sessionStorage, SESSION_ID_KEY) || _memSessionId;
    if (!id) {
      id = generateUUID();
      safeSet(sessionStorage, SESSION_ID_KEY, id);
      _memSessionId = id;
    }
    return id;
  }

  // ── UTM + referrer ────────────────────────────────────────────────────────────
  function getUTMParams() {
    try {
      var p = new URLSearchParams(window.location.search);
      var utm = {};
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
        var v = p.get(k);
        if (v) utm[k] = v;
      });
      return Object.keys(utm).length ? utm : null;
    } catch (e) { return null; }
  }

  var _firstTouch = null;
  function getFirstTouch() {
    if (_firstTouch) return _firstTouch;
    try {
      var stored = safeGet(localStorage, FIRST_TOUCH_KEY);
      if (stored) { _firstTouch = JSON.parse(stored); return _firstTouch; }
    } catch (e) {}
    _firstTouch = {
      referrer:    document.referrer || null,
      landing_url: window.location.href,
      utm:         getUTMParams(),
      ts:          new Date().toISOString()
    };
    safeSet(localStorage, FIRST_TOUCH_KEY, JSON.stringify(_firstTouch));
    return _firstTouch;
  }

  // ── localStorage retry queue (network failures across page loads) ─────────────
  function getQueue() {
    try { return JSON.parse(safeGet(localStorage, QUEUE_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveQueue(q) {
    safeSet(localStorage, QUEUE_KEY, JSON.stringify(q.slice(-20)));
  }
  function enqueue(ev) {
    var q = getQueue();
    q.push({ ev: ev, queued_at: Date.now(), attempts: 0 });
    saveQueue(q);
  }

  async function drainQueue() {
    var q = getQueue();
    if (!q.length) return;
    var retry = [];
    for (var i = 0; i < q.length; i++) {
      var item = q[i];
      try {
        var res = await fetch(TRACK_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({}, item.ev, { _queued: true, _attempt: item.attempts + 1 }))
        });
        if (!res.ok) throw new Error('non-2xx');
      } catch (e) {
        if (item.attempts < 3) retry.push(Object.assign({}, item, { attempts: item.attempts + 1 }));
      }
    }
    saveQueue(retry);
  }

  // ── sendBeacon fallback ───────────────────────────────────────────────────────
  function beacon(ev) {
    if (!navigator.sendBeacon) return false;
    try {
      return navigator.sendBeacon(TRACK_ENDPOINT, new Blob([JSON.stringify(ev)], { type: 'text/plain' }));
    } catch (e) { return false; }
  }

  // ── Build enriched event ──────────────────────────────────────────────────────
  function buildEvent(evOrName, properties) {
    var ev = (typeof evOrName === 'string')
      ? { event_name: evOrName, properties: properties || {} }
      : Object.assign({}, evOrName);

    if (!ev.session_id) ev.session_id = getSessionId();

    // anon_id — always present, always its own field
    var anonId = getUserHash();
    if (!ev.anon_id) ev.anon_id = anonId;
    ev._anon_id = anonId; // explicit diagnostic copy

    // architect_id — canonical only; never substituted with anon_id
    if (!ev.architect_id && _canonicalId) ev.architect_id = _canonicalId;

    ev.referrer    = ev.referrer !== undefined ? ev.referrer : (document.referrer || null);
    ev.page_url    = window.location.href;
    ev.utm         = getUTMParams();
    ev.first_touch = getFirstTouch();

    // Diagnostic fields
    ev._identity_source = _identitySource;
    if (!ev._send_method) ev._send_method = 'fetch';

    return ev;
  }

  // ── Low-level send (fetch → beacon → queue) ───────────────────────────────────
  async function sendEvent(ev) {
    try {
      var res = await fetch(TRACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ev)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
    } catch (e) {
      console.warn('[Analytics] send failed, trying beacon then queue:', e.message);
      ev._send_method = 'beacon';
      if (!beacon(ev)) {
        ev._send_method = 'queued';
        enqueue(ev);
      }
    }
  }

  // ── Public track ─────────────────────────────────────────────────────────────
  async function track(evOrName, properties) {
    if (!ANALYTICS_ENABLED) return;
    var ev = buildEvent(evOrName, properties);

    if (!_identityResolved) {
      // Identity not yet resolved — hold in pre-identity queue
      ev._send_method = 'pre_identity_queue';
      _preIdentityQueue.push(ev);
      return;
    }

    await sendEvent(ev);
  }

  // Flush events held before identity was available, now enriched with canonical ID
  async function flushPreIdentityQueue() {
    var held = _preIdentityQueue.splice(0);
    for (var i = 0; i < held.length; i++) {
      var ev = held[i];
      ev.architect_id     = _canonicalId;
      ev._identity_source = _identitySource;
      ev._send_method     = 'fetch';
      await sendEvent(ev);
    }
  }

  // ── Session initialisation — deterministic, deduplicated ─────────────────────
  async function initializeSession() {
    // Race: architect-id.js resolution vs 2 s timeout
    var identity;
    try {
      identity = await Promise.race([
        waitForCanonicalId(),
        new Promise(function (_, rej) {
          setTimeout(function () { rej(new Error('identity_timeout')); }, IDENTITY_TIMEOUT);
        })
      ]);
    } catch (e) {
      identity = { id: null, source: 'unavailable' };
    }

    _canonicalId       = identity.id;
    _identitySource    = identity.source;
    _identityResolved  = true;  // unblocks track() — must happen before flushPreIdentityQueue

    // Diagnostic console log
    var ft = getFirstTouch();
    console.log(
      '[Analytics] Identity resolved\n' +
      '  canonical:    ' + (_canonicalId ? _canonicalId.slice(0, 8) + '...' : 'null (unavailable)') + '\n' +
      '  anon_id:      ' + getUserHash().slice(0, 8) + '...\n' +
      '  source:       ' + _identitySource + '\n' +
      '  entry:        ' + window.location.pathname + window.location.search + '\n' +
      '  referrer:     ' + (ft.referrer || '(none)') + '\n' +
      '  utm:          ' + JSON.stringify(ft.utm)
    );

    // Flush any events that arrived before identity was ready
    await flushPreIdentityQueue();

    // ── session_start deduplication ───────────────────────────────────────────
    // Guard 1: in-memory flag (catches re-entrant calls within this page load)
    if (_sessionStartFired) return;

    // Guard 2: sessionStorage flag keyed to current session_id
    // (sessionStorage is tab-isolated, so each tab fires its own session_start)
    var currentSession = getSessionId();
    var firedSession   = safeGet(sessionStorage, SESSION_START_KEY);
    if (firedSession === currentSession) {
      _sessionStartFired = true;
      return;
    }

    _sessionStartFired = true;
    safeSet(sessionStorage, SESSION_START_KEY, currentSession);

    await track({
      event_name:      'session_start',
      architect_id:    _canonicalId,
      _identity_source: _identitySource,
      _send_method:    'fetch'
    });
  }

  // ── Legacy wrappers ───────────────────────────────────────────────────────────
  function trackEvent(eventType, eventDetails) {
    track({ event_name: eventType, properties: eventDetails || {} });
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  window.MaigiclyAnalytics = {
    track:       track,
    trackEvent:  trackEvent,
    get session_id()       { return getSessionId(); },
    get user_id()          { return getUserHash(); },
    get architect_id()     { return _canonicalId; },
    get identity_source()  { return _identitySource; }
  };

  // Keep the global shorthand working (used throughout the app)
  window.trackEvent = function (eventName, detail) {
    track(Object.assign({ event_name: eventName }, detail || {}));
  };

  // ── Boot ──────────────────────────────────────────────────────────────────────
  drainQueue().catch(function () {});
  getFirstTouch(); // capture referrer/UTM at the earliest possible moment
  initializeSession();

  console.log('[Analytics] Initializing (waiting for identity)...');
})();
