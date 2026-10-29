// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
/**
 * Forge Companion — Continuum Probe Layer
 *
 * Replaces window.showMissionHint() with a constraint-based
 * Continuum probe question. Same function signature. Same display
 * overlay. Nothing else in the Forge changes.
 *
 * Must load AFTER refined-forge-hints.js (uses it as static fallback).
 */
window.ForgeCompanion = (function() {
  'use strict';

  const ENDPOINT = '/api/forge-probe';

  let _forgeSubmitCount = {};
  let _forgeLastKey = '';
  let _lastFailure = { target_part_id: null, target_part_name: null, attempted_mod: null, correct_mod: null };

  function _logForgeEvent(cName, qName, mId, evtName, extra) {
    const base = {
      session_id: localStorage.getItem('current_session_id') || '',
      architect_id: localStorage.getItem('maigicly_architect_id') || localStorage.getItem('architect_id') || '',
      chamber: cName, qbit: qName, mission_id: mId, part_or_slot: _forgeLastKey
    };
    fetch('/api/track-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ event_name: evtName }, base, extra)) }).catch(() => {});
  }

  function _applyForgeLimit(hintNotification) {
    const msg = 'Got it. Try something different.';
    const inp = document.getElementById('forgeTextInput');
    const btn = document.getElementById('forgeTextSubmit');
    const limitEl = document.getElementById('forgeTextLimit');
    if (inp) { inp.disabled = true; inp.style.opacity = '0.4'; }
    if (btn) { btn.disabled = true; btn.style.display = 'none'; }
    if (limitEl) { limitEl.textContent = msg; limitEl.style.display = 'block'; }
  }

  async function _callContinuum(payload) {
    const resp = await fetch(ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error(`forge-probe error: ${resp.status}`);
    const data = await resp.json();
    return data.probe;
  }

  function _displayProbe(probeText) {
    const hintNotification = document.getElementById('hintNotification');
    const hintOverlay      = document.getElementById('hintOverlay');

    if (!hintNotification || !hintOverlay) {
      console.warn('[ForgeCompanion] Hint overlay not found');
      return;
    }

    const titleEl = hintNotification.querySelector('h3') ||
                    hintNotification.querySelector('.hint-title');
    const msgEl   = hintNotification.querySelector('.hint-message') ||
                    hintNotification.querySelector('p');

    if (titleEl) titleEl.textContent = '◈ SYSTEM PROBE';
    if (msgEl)   msgEl.innerHTML = probeText;

    hintOverlay.style.display      = 'block';
    hintNotification.style.display = 'block';
  }

  function _staticFallback(missionName, attempt, issue) {
    if (!window.RefinedForgeHints) return;
    const data = issue
      ? window.RefinedForgeHints.getSystemValidationHint(issue, missionName)
      : window.RefinedForgeHints.getSystemHint(missionName, attempt);
    if (typeof showEnhancedHint === 'function') {
      showEnhancedHint(data);
    } else {
      _displayProbe(data.message);
    }
  }

  function _showForgeTextInput(missionName, missionId, attempt) {
    const hintNotification = document.getElementById('hintNotification');
    if (!hintNotification) return;
    const key = (missionId || missionName) + '_' + (attempt || 0);
    const existingBox = document.getElementById('forgeTextBox');
    if (existingBox) {
      if (key !== _forgeLastKey) {
        _forgeLastKey = key;
        const ri = document.getElementById('forgeTextInput');
        const rb = document.getElementById('forgeTextSubmit');
        const rs = document.getElementById('forgeTextStatus');
        const rl = document.getElementById('forgeTextLimit');
        if (ri) { ri.disabled = false; ri.style.opacity = '1'; ri.value = ''; }
        if (rb) { rb.disabled = false; rb.style.opacity = '1'; rb.style.display = ''; }
        if (rs) rs.textContent = '';
        if (rl) rl.style.display = 'none';
      }
      if ((_forgeSubmitCount[key] || 0) >= 3) { _applyForgeLimit(hintNotification); }
      return;
    }
    _forgeLastKey = key;
    let _micUsed = false;
    const box = document.createElement('div');
    box.id = 'forgeTextBox';
    box.style.cssText = 'margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;';
    box.innerHTML =
      '<div style="font-size:11px;color:#57d3ff;letter-spacing:0.1em;margin-bottom:4px;">SUPPORT SYSTEM ACTIVATED</div>' +
      '<div style="font-size:12px;color:#9aa3b2;margin-bottom:6px;">What do you know about this?</div>' +
      '<div style="display:flex;gap:8px;justify-content:center;align-items:center;">' +
        '<input id="forgeTextInput" type="text" placeholder="I tried this because..." style="background:rgba(87,211,255,0.07);border:1px solid #57d3ff;border-radius:10px;color:#e2e8f0;padding:7px 12px;font-size:13px;width:200px;outline:none;">' +
        '<button id="forgeMicBtn" style="background:rgba(87,211,255,0.1);border:1px solid #57d3ff;border-radius:10px;color:#57d3ff;padding:7px 10px;cursor:pointer;font-size:15px;line-height:1;" title="Speak your answer">🎤</button>' +
        '<button id="forgeTextSubmit" style="background:rgba(87,211,255,0.1);border:1px solid #57d3ff;border-radius:10px;color:#57d3ff;padding:7px 12px;cursor:pointer;font-size:13px;">Send</button>' +
      '</div>' +
      '<div id="forgeTextStatus" style="margin-top:6px;font-size:12px;color:#9aa3b2;min-height:14px;"></div>' +
      '<div id="forgeTextLimit" style="display:none;margin-top:8px;font-size:12px;color:#94a3b8;font-style:italic;padding:6px 12px;border-top:1px solid rgba(255,255,255,0.06);"></div>';
    hintNotification.appendChild(box);
    function _doSend() {
      const inp = document.getElementById('forgeTextInput');
      const statusEl = document.getElementById('forgeTextStatus');
      const btn = document.getElementById('forgeTextSubmit');
      const val = inp ? inp.value.trim() : '';
      if (!val || (btn && btn.disabled)) return;
      const usedMic = _micUsed;
      _micUsed = false;
      const k = _forgeLastKey;
      const count = (_forgeSubmitCount[k] || 0) + 1;
      _forgeSubmitCount[k] = count;
      if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
      if (statusEl) statusEl.textContent = 'Sending\u2026';
      _logForgeEvent(missionId || missionName, missionName, missionId || '', 'voice_capture', { transcript: val, input_type: usedMic ? 'speech' : 'text', mic_used: usedMic, text_submission_count: count, result: 'wrong' });
      fetch('/api/chamber-probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          architect_id: localStorage.getItem('maigicly_architect_id') || localStorage.getItem('architect_id') || '',
          session_id: localStorage.getItem('current_session_id') || '',
          chamber: missionId || missionName, qbit_name: missionName,
          attempted_fix: '', attempt_number: attempt || 0,
          voice_transcript: val, prompt_type: 'voice_response',
          mic_used: usedMic, input_type: usedMic ? 'speech' : 'text', result: 'wrong', text_submission_count: count,
          dropped_into_slot: '', correct_mod_for_slot: ''
        })
      })
      .then(r => r.json())
      .then(data => {
        if (inp) inp.value = '';
        if (statusEl) statusEl.textContent = '';
        _logForgeEvent(missionId || missionName, missionName, missionId || '', 'probe_response_received', { text_submission_count: count, response_text: data.probe || '', result: 'wrong' });
        if (data.probe) {
          const msgEl = hintNotification.querySelector('.hint-message') || hintNotification.querySelector('p');
          if (msgEl) msgEl.innerHTML = '◈  ' + data.probe;
        }
        if (count >= 3) {
          const msg = 'Got it. Try something different.';
          _logForgeEvent(missionId || missionName, missionName, missionId || '', 'probe_limit_reached', { text_submission_count: 3, fallback_message: msg, probe_limited: true });
          _applyForgeLimit(hintNotification);
          _logForgeEvent(missionId || missionName, missionName, missionId || '', 'fallback_nudge_shown', { text_submission_count: 3, fallback_message: msg, probe_limited: true });
        } else {
          if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
        }
      })
      .catch(err => {
        if (inp) inp.value = '';
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
        if (statusEl) statusEl.textContent = 'Error \u2014 try again.';
        _logForgeEvent(missionId || missionName, missionName, missionId || '', 'probe_error', { text_submission_count: count, error_message: err ? err.message || String(err) : 'unknown', result: 'wrong' });
      });
    }
    document.getElementById('forgeTextSubmit').addEventListener('click', _doSend);
    document.getElementById('forgeTextInput').addEventListener('keydown', e => { if (e.key === 'Enter') _doSend(); });
    const forgeMic = document.getElementById('forgeMicBtn');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      if (forgeMic) forgeMic.style.display = 'none';
    } else {
      forgeMic.addEventListener('click', () => {
        const inp = document.getElementById('forgeTextInput');
        try {
          const recog = new SR();
          recog.lang = 'en-US';
          recog.interimResults = false;
          recog.maxAlternatives = 1;
          recog.onstart = () => { forgeMic.textContent = '🔴'; forgeMic.disabled = true; };
          recog.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            if (inp) inp.value = transcript;
            _micUsed = true;
            _doSend();
          };
          recog.onerror = () => { forgeMic.textContent = '🎤'; forgeMic.disabled = false; };
          recog.onend = () => { forgeMic.textContent = '🎤'; forgeMic.disabled = false; };
          recog.start();
        } catch(e) {}
      });
    }
  }

  function setLastFailure(data) {
    _lastFailure = Object.assign({ target_part_id: null, target_part_name: null, attempted_mod: null, correct_mod: null }, data || {});
  }

  async function showMissionHint(missionName, attempt, issue) {
    const ctx = window.getForgeContext ? window.getForgeContext() : {
      mission_id: '', mission_name: missionName,
      selected_parts: [], selected_fixes: [], selected_boost: null
    };

    const sessionData = window.ForgeSessionLogger
      ? window.ForgeSessionLogger.getCurrentSession()
      : null;

    const payload = {
      mission_id:        ctx.mission_id,
      mission_name:      missionName,
      attempt_number:    attempt,
      validation_issue:  issue || null,
      selected_parts:    ctx.selected_parts,
      selected_fixes:    ctx.selected_fixes,
      selected_boost:    ctx.selected_boost,
      recent_selections: window.ForgeSessionLogger
                           ? window.ForgeSessionLogger.getRecentSelections(3)
                           : [],
      partial_scores:    sessionData && sessionData.validation_attempts && sessionData.validation_attempts.length
                           ? sessionData.validation_attempts[sessionData.validation_attempts.length - 1]
                           : {},
      mechanism:         window.VoicePicker ? window.VoicePicker.getMechanism() : '',
      target_part_id:    _lastFailure.target_part_id,
      target_part_name:  _lastFailure.target_part_name,
      attempted_mod:     _lastFailure.attempted_mod,
      correct_mod:       _lastFailure.correct_mod
    };

    try {
      const probeText = await _callContinuum(payload);
      _displayProbe(probeText);
      _showForgeTextInput(missionName, ctx.mission_id, attempt);

      if (window.ForgeSessionLogger) {
        window.ForgeSessionLogger.logProbeResponse(probeText, null);
      }
    } catch (e) {
      console.warn('[ForgeCompanion] Continuum unavailable, using static fallback:', e.message);
      _staticFallback(missionName, attempt, issue);
    }
  }

  return { showMissionHint, setLastFailure };
})();

// Override global showMissionHint — forge-companion.js must load AFTER refined-forge-hints.js
window.showMissionHint = window.ForgeCompanion.showMissionHint;
// Forge pages call this before triggering showMissionHint when a specific slot/mod is known
window.setForgeLastFailure = window.ForgeCompanion.setLastFailure;
