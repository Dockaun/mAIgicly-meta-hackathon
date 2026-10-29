// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
/**
 * Voice Picker — 3-pick mechanism description system
 * School-safe structured choices. No free text.
 * Output: "aligns the timing — needs perfect sync — like a tuning fork"
 * This string feeds Continuum targeted probe questions.
 */
window.VoicePicker = (function() {
  'use strict';

  const VOICE_CONFIG = {
    harmonic_tuning: {
      how: [
        { id: 'aligns_timing', label: 'aligns the timing' },
        { id: 'splits_path',   label: 'splits the path open' },
        { id: 'holds_state',   label: 'holds the state open' }
      ],
      fails: [
        { id: 'timing_slips',    label: 'breaks when timing slips' },
        { id: 'needs_sync',      label: 'needs perfect sync' },
        { id: 'pressure_cracks', label: 'cracks under pressure' }
      ],
      like: [
        { id: 'tuning_fork',    label: 'like a tuning fork' },
        { id: 'relay_race',     label: 'like a relay race' },
        { id: 'precision_lock', label: 'like a precision lock' }
      ]
    },
    entanglement: {
      how: [
        { id: 'links_distant',  label: 'links distant channels' },
        { id: 'mirrors_signal', label: 'mirrors the signal' },
        { id: 'holds_both',     label: 'holds both states open' }
      ],
      fails: [
        { id: 'sync_breaks',    label: 'breaks when sync is lost' },
        { id: 'noise_exposes',  label: 'noise exposes the link' },
        { id: 'distance_tears', label: 'distance tears the link' }
      ],
      like: [
        { id: 'mirror',           label: 'like a mirror' },
        { id: 'quantum_bridge',   label: 'like a quantum bridge' },
        { id: 'invisible_thread', label: 'like an invisible thread' }
      ]
    },
    coherence_stitching: {
      how: [
        { id: 'aligns_waves',   label: 'aligns the waves' },
        { id: 'stitches_paths', label: 'stitches paths together' },
        { id: 'holds_pattern',  label: 'holds the pattern steady' }
      ],
      fails: [
        { id: 'drift_breaks', label: 'drift breaks the stitch' },
        { id: 'noise_tears',  label: 'noise tears the pattern' },
        { id: 'weak_bond',    label: 'weak bond falls apart' }
      ],
      like: [
        { id: 'woven_light',    label: 'like woven light' },
        { id: 'living_mesh',    label: 'like a living mesh' },
        { id: 'invisible_knit', label: 'like invisible knitting' }
      ]
    },
    energy_absorption: {
      how: [
        { id: 'absorbs_excess', label: 'absorbs the excess' },
        { id: 'grounds_energy', label: 'grounds the energy' },
        { id: 'controls_flow',  label: 'controls the flow' }
      ],
      fails: [
        { id: 'overloads',     label: 'overloads under pressure' },
        { id: 'leaks_energy',  label: 'leaks under high load' },
        { id: 'slow_response', label: 'slow to respond' }
      ],
      like: [
        { id: 'deep_sponge',  label: 'like a deep sponge' },
        { id: 'silent_dam',   label: 'like a silent dam' },
        { id: 'battery_core', label: 'like a battery core' }
      ]
    },
    stealth_masking: {
      how: [
        { id: 'hides_signal',  label: 'hides the signal' },
        { id: 'phases_cancel', label: 'phases waves to cancel' },
        { id: 'masks_pattern', label: 'masks the pattern' }
      ],
      fails: [
        { id: 'noise_exposes',  label: 'noise exposes the mask' },
        { id: 'timing_breaks',  label: 'timing breaks the veil' },
        { id: 'change_reveals', label: 'any change reveals it' }
      ],
      like: [
        { id: 'living_shadow',      label: 'like a living shadow' },
        { id: 'ghost_signal',       label: 'like a ghost signal' },
        { id: 'perfect_camouflage', label: 'like perfect camouflage' }
      ]
    }
  };

  const _picks = { how: null, fails: null, like: null };

  function render(missionId) {
    const config = VOICE_CONFIG[missionId];
    if (!config) {
      console.warn('[VoicePicker] No config for:', missionId);
      return;
    }
    _picks.how = null;
    _picks.fails = null;
    _picks.like = null;
    _renderGroup('voicePicker_how',   config.how,   'how');
    _renderGroup('voicePicker_fails', config.fails, 'fails');
    _renderGroup('voicePicker_like',  config.like,  'like');
    _updatePreview();
  }

  function _renderGroup(containerId, options, dimension) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    options.forEach(opt => {
      const chip = document.createElement('button');
      chip.className   = 'voice-chip';
      chip.textContent = opt.label;
      chip.dataset.id  = opt.id;
      chip.type        = 'button';
      chip.addEventListener('click', () => {
        container.querySelectorAll('.voice-chip')
          .forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        _picks[dimension] = { id: opt.id, label: opt.label };
        _updatePreview();
        if (window.MaigiclyAnalytics) {
          window.MaigiclyAnalytics.track({ event_name: 'voicepicker_select', properties: { dimension, id: opt.id, label: opt.label } });
        }
        if (window.ForgeSessionLogger) {
          window.ForgeSessionLogger.logComponentAction(
            `voice_${dimension}_${opt.id}`, 'voice', 'select'
          );
        }
      });
      container.appendChild(chip);
    });
  }

  function _updatePreview() {
    const preview = document.getElementById('mechanismPreview');
    if (!preview) return;
    if (_picks.how && _picks.fails && _picks.like) {
      const mechanism = getMechanism();
      preview.textContent  = mechanism;
      preview.style.color  = '#34d399';
      preview.style.border = '1px solid rgba(52,211,153,0.4)';
      const storyBox = document.getElementById('qbitStory');
      if (storyBox) storyBox.value = mechanism;
      _checkEnableSave();
    } else {
      const parts = [
        _picks.how   ? _picks.how.label   : '___',
        _picks.fails ? _picks.fails.label : '___',
        _picks.like  ? _picks.like.label  : '___'
      ];
      preview.textContent  = parts.join(' — ');
      preview.style.color  = '#9aa3b2';
      preview.style.border = '1px dashed #2a2f45';
    }
  }

  function _checkEnableSave() {
    const saveBtn = document.getElementById('btnSave');
    if (!saveBtn) return;
    const validationPassed = window._forgeStepReached >= 2;
    saveBtn.disabled = !(validationPassed && isComplete());
  }

  function getMechanism() {
    if (!isComplete()) return '';
    return `${_picks.how.label} — ${_picks.fails.label} — ${_picks.like.label}`;
  }

  function getPicks() {
    return { ..._picks };
  }

  function isComplete() {
    return !!(_picks.how && _picks.fails && _picks.like);
  }

  function onValidationPassed() {
    _checkEnableSave();
  }

  return { render, getMechanism, getPicks, isComplete, onValidationPassed };
})();
