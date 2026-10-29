// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
/**
 * Session Logger — Forge Reasoning Trace Capture
 *
 * Not analytics. These traces are the training signal for
 * future per-learner LoRA adapters.
 * Every session without a trace is permanently lost data.
 */
window.ForgeSessionLogger = (function() {
  'use strict';

  let _session = null;
  let _lastInteractionTime = Date.now();

  function _getLearnerId() {
    return window.ArchitectID ? window.ArchitectID.get() :
      localStorage.getItem('maigicly_architect_id') || 'unknown';
  }

  function _generateUUID() {
    return crypto.randomUUID ? crypto.randomUUID() :
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
  }

  function _computeFrictionScore(session) {
    const resistanceMs = session.total_resistance_ms || 0;
    const revisionCount = session.revision_count || 0;
    const hasBifurcation = session.component_sequence.some(e => e.was_deselected);
    return parseFloat(
      ((resistanceMs / 1000) * revisionCount * (hasBifurcation ? 1 : 0.3)).toFixed(3)
    );
  }

  function startSession(missionId) {
    _lastInteractionTime = Date.now();
    _session = {
      session_id:          _generateUUID(),
      learner_id:          _getLearnerId(),
      mission_id:          missionId,
      started_at:          new Date().toISOString(),
      component_sequence:  [],
      dwell_times:         {},
      validation_attempts: [],
      probe_history:       [],
      final_build:         { parts: [], fixes: [], boost: '' },
      session_outcome:     'in_progress',
      revision_count:      0,
      total_resistance_ms: 0,
      friction_score:      0
    };
    console.log('[SessionLogger] Started:', _session.session_id.slice(0, 8) + '...');
    return _session.session_id;
  }

  function logComponentAction(componentId, group, action) {
    if (!_session) return;
    const now = Date.now();
    const dwellMs = now - _lastInteractionTime;
    _lastInteractionTime = now;

    _session.component_sequence.push({
      component:      componentId,
      group:          group,
      action:         action,
      timestamp:      now,
      dwell_ms:       dwellMs,
      was_deselected: action === 'deselect'
    });

    if (action === 'select') {
      _session.dwell_times[componentId] = dwellMs;
    }
    if (action === 'deselect') {
      _session.revision_count++;
    }

    _session.total_resistance_ms += dwellMs;
  }

  function logValidationAttempt(attemptN, partialScores, validationIssue) {
    if (!_session) return;
    const now = Date.now();
    const resistanceMs = now - _lastInteractionTime;
    _lastInteractionTime = now;
    _session.total_resistance_ms += resistanceMs;

    _session.validation_attempts.push({
      attempt_n:     attemptN,
      partial_parts: partialScores.parts || 0,
      partial_fixes: partialScores.fixes || 0,
      partial_boost: partialScores.boost || 0,
      issue:         validationIssue || null,
      timestamp:     now,
      resistance_ms: resistanceMs
    });
  }

  function logProbeResponse(probeText, learnerResponse) {
    if (!_session) return;
    const now = Date.now();
    const resistanceMs = now - _lastInteractionTime;
    _lastInteractionTime = now;

    _session.probe_history.push({
      probe_text:       probeText,
      learner_response: learnerResponse || null,
      timestamp:        now,
      resistance_ms:    resistanceMs
    });
  }

  function logFinalBuild(parts, fixes, boost) {
    if (!_session) return;
    _session.final_build = { parts, fixes, boost };
  }

  async function endSession(outcome, finalBuild) {
    if (!_session) return;

    _session.session_outcome     = outcome;
    if (finalBuild) _session.final_build = finalBuild;
    _session.ended_at            = new Date().toISOString();
    _session.friction_score      = _computeFrictionScore(_session);

    console.log('[SessionLogger] Ending. Friction:', _session.friction_score);

    const completed = { ..._session };
    _session = null;

    await _persist(completed);
    _saveLocalBackup(completed);

    return completed;
  }

  function getRecentSelections(n) {
    n = n || 3;
    if (!_session) return [];
    return _session.component_sequence
      .filter(e => e.action === 'select')
      .slice(-n)
      .map(e => e.component);
  }

  function getCurrentSession() {
    return _session ? { ..._session } : null;
  }

  async function _persist(sessionData) {
    try {
      const resp = await fetch('/api/session-log', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(sessionData)
      });
      if (resp.ok) {
        console.log('[SessionLogger] Trace persisted');
      }
    } catch (e) {
      console.warn('[SessionLogger] Persist failed:', e.message);
    }
  }

  function _saveLocalBackup(sessionData) {
    try {
      const key      = 'forge_session_traces';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.unshift(sessionData);
      if (existing.length > 20) existing.length = 20;
      localStorage.setItem(key, JSON.stringify(existing));
    } catch (e) {
      console.warn('[SessionLogger] Local backup failed:', e.message);
    }
  }

  return {
    startSession,
    logComponentAction,
    logValidationAttempt,
    logProbeResponse,
    logFinalBuild,
    endSession,
    getRecentSelections,
    getCurrentSession
  };
})();
