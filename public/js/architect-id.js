// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
/**
 * Architect ID Manager
 *
 * Deterministic identity initialisation — works regardless of script load order.
 *
 * Contract:
 *   window.ArchitectID.get()   → canonical UUID string (sync, always returns a value)
 *   window.ArchitectID.ready   → Promise<{ id, source }> — resolves as soon as this
 *                                script executes (microtask at the latest)
 *   window.__maigiclyArchitectId → shared deferred used by analytics.js when it loads
 *                                  before this script; set by whichever file loads first
 *
 * identity_source values:
 *   'existing'        — found in localStorage (returning visitor / returning tab)
 *   'new'             — generated fresh and stored in localStorage
 *   'memory_fallback' — localStorage is blocked (Safari ITP, TikTok in-app browser)
 */

// Shared deferred — initialised by whichever of analytics.js / architect-id.js loads first.
// When this script resolves, any waiters registered by analytics.js are called immediately.
window.__maigiclyArchitectId = window.__maigiclyArchitectId || { result: null, waiters: [] };

(function (window) {
  'use strict';

  const STORAGE_KEY = 'maigicly_architect_id';
  const ALIAS_KEY   = 'resonanceAlias';

  // ── localStorage availability (tested once, result cached) ────────────────────
  var _storageOk = null;
  function storageAvailable() {
    if (_storageOk !== null) return _storageOk;
    try {
      var k = '__mag_ls_test__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      _storageOk = true;
    } catch (e) {
      _storageOk = false;
    }
    return _storageOk;
  }

  // In-memory fallback for when localStorage is blocked (survives the tab lifetime)
  var _memId = null;

  // ── UUID generator ────────────────────────────────────────────────────────────
  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ── Core init — called once synchronously ─────────────────────────────────────
  function initId() {
    if (!storageAvailable()) {
      if (!_memId) _memId = generateUUID();
      return { id: _memId, source: 'memory_fallback' };
    }
    var existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      return { id: existing, source: 'existing' };
    }
    var fresh = generateUUID();
    localStorage.setItem(STORAGE_KEY, fresh);
    console.log('[ArchitectID] New ID:', fresh.slice(0, 8) + '...');
    return { id: fresh, source: 'new' };
  }

  // ── Sync getter (used by forged-qbits-store.js, forge-companion.js, etc.) ─────
  function getArchitectId() {
    if (!storageAvailable()) {
      if (!_memId) _memId = generateUUID();
      return _memId;
    }
    var id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = generateUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  function getAlias() {
    return storageAvailable() ? (localStorage.getItem(ALIAS_KEY) || null) : null;
  }

  function setAlias(alias) {
    if (!storageAvailable()) return;
    if (alias) localStorage.setItem(ALIAS_KEY, alias);
    else        localStorage.removeItem(ALIAS_KEY);
  }

  // ── Initialise ────────────────────────────────────────────────────────────────
  var _identity = initId();

  // Resolve any waiters registered by analytics.js (which loads first on all pages)
  var _g = window.__maigiclyArchitectId;
  _g.result = _identity;
  if (_g.waiters.length) {
    _g.waiters.forEach(function (fn) { fn(_identity); });
    _g.waiters = [];
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  window.ArchitectID = {
    get:        getArchitectId,
    getAlias:   getAlias,
    setAlias:   setAlias,
    STORAGE_KEY: STORAGE_KEY,
    // Promise<{ id, source }> — resolves synchronously (microtask queue)
    ready: Promise.resolve(_identity)
  };

})(window);
