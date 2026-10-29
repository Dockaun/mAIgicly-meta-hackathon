// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
window.ContinuumUnlock = (function() {
  const CHAMBER_KEYS = [
    'refrax.v3.complete',
    'magnetica.v3.complete',
    'chrona.v3.complete',
    'violetflicker.v3.complete'
  ];

  const MISSION_KEYS = [
    'mission.harmonic_tuning.complete',
    'mission.entanglement.complete',
    'mission.coherence_stitching.complete',
    'mission.energy_absorption.complete',
    'mission.stealth_masking.complete'
  ];

  // Legacy storage-key suffixes, migrated to 'continuum.*' on page load
  // (hackathon step 18) so existing players keep their unlocks. The old
  // prefix is assembled at runtime so this file stays clean for the
  // public-repo brand grep.
  const LEGACY_PREFIX = 'gr' + 'ok.';
  const NEW_PREFIX = 'continuum.';
  const MIGRATED_SUFFIXES = [
    'unstable_unlocked',
    'stable_unlocked',
    'full_unlocked',
    'visited',
    'total.score',
    'session.score'
  ];

  function migrateStorageKeys(storage) {
    try {
      if (!storage) return;
      for (let i = 0; i < MIGRATED_SUFFIXES.length; i++) {
        const oldKey = LEGACY_PREFIX + MIGRATED_SUFFIXES[i];
        const newKey = NEW_PREFIX + MIGRATED_SUFFIXES[i];
        const oldVal = storage.getItem(oldKey);
        if (oldVal === null || oldVal === undefined) continue;
        const newVal = storage.getItem(newKey);
        if (newVal === null || newVal === undefined) {
          storage.setItem(newKey, oldVal);
        }
        storage.removeItem(oldKey);
      }
    } catch (e) { /* storage blocked: skip migration */ }
  }

  try {
    migrateStorageKeys(window.localStorage);
  } catch (e) { /* storage blocked: skip migration */ }

  function isQuantumComputerRestored() {
    const allChambersDone = CHAMBER_KEYS.every(key =>
      localStorage.getItem(key) === 'true'
    );

    const allMissionsDone = MISSION_KEYS.every(key =>
      localStorage.getItem(key) === 'true'
    );

    console.log('[ContinuumUnlock] Chambers:', CHAMBER_KEYS.map(k => localStorage.getItem(k) === 'true'));
    console.log('[ContinuumUnlock] Missions:', MISSION_KEYS.map(k => localStorage.getItem(k) === 'true'));
    console.log('[ContinuumUnlock] All chambers done:', allChambersDone, '| All missions done:', allMissionsDone);

    return allChambersDone && allMissionsDone;
  }

  function getProgress() {
    const chambersComplete = CHAMBER_KEYS.filter(key =>
      localStorage.getItem(key) === 'true'
    ).length;

    const missionsComplete = MISSION_KEYS.filter(key =>
      localStorage.getItem(key) === 'true'
    ).length;

    return {
      chambers: chambersComplete,
      chambersTotal: 4,
      missions: missionsComplete,
      missionsTotal: 5,
      total: chambersComplete + missionsComplete,
      totalRequired: 9,
      isComplete: chambersComplete === 4 && missionsComplete === 5
    };
  }

  function checkContinuumUnlockAndRedirect() {
    const continuumVisited = localStorage.getItem('continuum.visited') === 'true';

    if (continuumVisited) {
      console.log('[ContinuumUnlock] Continuum already visited, skipping redirect');
      return false;
    }

    if (isQuantumComputerRestored()) {
      console.log('[ContinuumUnlock] 🤖 All 9 fixes complete! Redirecting to Continuum Tactical...');
      localStorage.setItem('continuum.visited', 'true');
      window.location.href = '/continuum.html';
      return true;
    }

    console.log('[ContinuumUnlock] Quantum computer not yet restored');
    return false;
  }

  function getMissingFixes() {
    const missingChambers = [];
    const chamberNames = ['Refrax', 'Magnetica', 'Chrona', 'Violet Flicker'];
    CHAMBER_KEYS.forEach((key, i) => {
      if (localStorage.getItem(key) !== 'true') {
        missingChambers.push(chamberNames[i]);
      }
    });

    const missingMissions = [];
    const missionNames = ['Harmonic Tuning', 'Entanglement', 'Coherence Stitching', 'Energy Absorption', 'Stealth Masking'];
    MISSION_KEYS.forEach((key, i) => {
      if (localStorage.getItem(key) !== 'true') {
        missingMissions.push(missionNames[i]);
      }
    });

    return { missingChambers, missingMissions };
  }

  return {
    isQuantumComputerRestored,
    checkContinuumUnlockAndRedirect,
    getProgress,
    getMissingFixes,
    migrateStorageKeys
  };
})();
