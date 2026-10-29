'use strict';
// Hackathon step 18: legacy-brand removal. Dead controller tables are gone
// from startup schema; identifiers/keys renamed to Continuum names with a
// storage migration so players keep unlocks; docs neutralized.
// (node:test + node:assert only; no network.)
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
// Assembled so this file stays clean for the brand grep.
const LEGACY_WORDS = ['gr' + 'ok', 'deep' + 'seek', 'pinocch' + 'aio'];

function fakeStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

function loadUnlockModule(seed) {
  const storage = fakeStorage(seed);
  const sandboxWindow = { localStorage: storage, location: {} };
  const src = fs.readFileSync(path.join(root, 'public', 'js', 'continuum-unlock.js'), 'utf8');
  const factory = new Function('window', 'localStorage', `${src}\nreturn window.ContinuumUnlock;`);
  const api = factory(sandboxWindow, storage);
  return { api, storage, sandboxWindow };
}

const ALL_COMPLETE = {
  'refrax.v3.complete': 'true',
  'magnetica.v3.complete': 'true',
  'chrona.v3.complete': 'true',
  'violetflicker.v3.complete': 'true',
  'mission.harmonic_tuning.complete': 'true',
  'mission.entanglement.complete': 'true',
  'mission.coherence_stitching.complete': 'true',
  'mission.energy_absorption.complete': 'true',
  'mission.stealth_masking.complete': 'true',
};

describe('storage migration keeps player unlocks', () => {
  test('legacy keys copy to continuum.* once, then old keys go away', () => {
    const legacy = 'gr' + 'ok.';
    const { storage } = loadUnlockModule({
      [legacy + 'unstable_unlocked']: 'true',
      [legacy + 'visited']: 'true',
      [legacy + 'total.score']: '1200',
    });
    assert.equal(storage.getItem('continuum.unstable_unlocked'), 'true');
    assert.equal(storage.getItem('continuum.visited'), 'true');
    assert.equal(storage.getItem('continuum.total.score'), '1200');
    assert.equal(storage.getItem(legacy + 'unstable_unlocked'), null);
    assert.equal(storage.getItem(legacy + 'visited'), null);
    assert.equal(storage.getItem(legacy + 'total.score'), null);
  });

  test('an existing new key wins; the old key is still removed', () => {
    const legacy = 'gr' + 'ok.';
    const { storage } = loadUnlockModule({
      [legacy + 'stable_unlocked']: 'true',
      'continuum.stable_unlocked': 'false',
    });
    assert.equal(storage.getItem('continuum.stable_unlocked'), 'false');
    assert.equal(storage.getItem(legacy + 'stable_unlocked'), null);
  });

  test('empty or blocked storage is a no-op', () => {
    const { api, storage } = loadUnlockModule({});
    assert.equal(storage._map.size, 0);
    assert.doesNotThrow(() => api.migrateStorageKeys(null));
    assert.doesNotThrow(() => api.migrateStorageKeys(undefined));
  });

  test('unlock logic unchanged apart from names', () => {
    const { api, sandboxWindow } = loadUnlockModule({ ...ALL_COMPLETE });
    assert.equal(api.isQuantumComputerRestored(), true);
    assert.deepEqual(api.getProgress(), {
      chambers: 4, chambersTotal: 4, missions: 5, missionsTotal: 5,
      total: 9, totalRequired: 9, isComplete: true,
    });
    assert.equal(api.checkContinuumUnlockAndRedirect(), true);
    assert.equal(sandboxWindow.location.href, '/continuum.html');
    assert.equal(api.checkContinuumUnlockAndRedirect(), false, 'second visit skips');
    const fresh = loadUnlockModule({});
    assert.equal(fresh.api.isQuantumComputerRestored(), false);
    assert.equal(fresh.api.getMissingFixes().missingChambers.length, 4);
  });
});

describe('renames are wired everywhere', () => {
  test('module file renamed and loaded by chambers + select', () => {
    assert.ok(fs.existsSync(path.join(root, 'public', 'js', 'continuum-unlock.js')));
    assert.ok(!fs.existsSync(path.join(root, 'public', 'js', 'gr' + 'ok-unlock.js')));
    for (const file of [
      'public/chambers/refrax.html', 'public/chambers/magnetica.html',
      'public/chambers/chrona.html', 'public/chambers/violetflicker.html',
      'public/select.html',
    ]) {
      const src = fs.readFileSync(path.join(root, file), 'utf8');
      assert.ok(src.includes('/js/continuum-unlock.js'), `${file} loads the module`);
    }
    for (const file of [
      'public/chambers/refrax.js', 'public/chambers/magnetica.js',
      'public/chambers/chrona.js', 'public/chambers/violetflicker.js',
    ]) {
      const src = fs.readFileSync(path.join(root, file), 'utf8');
      assert.ok(src.includes('checkContinuumUnlockAndRedirect'), `${file} calls renamed check`);
      assert.ok(src.includes("'continuum-probe'"), `${file} uses renamed probe id`);
    }
  });

  test('resonance and continuum use the new names', () => {
    const resonance = fs.readFileSync(path.join(root, 'public', 'resonance.html'), 'utf8');
    for (const token of ['id="continuumBtn"', 'continuum.unstable_unlocked',
      'continuum.stable_unlocked', 'continuum.full_unlocked', 'migrateLegacyKeys',
      'continuum_button_clicked_from_resonance']) {
      assert.ok(resonance.includes(token), `resonance: ${token}`);
    }
    const continuum = fs.readFileSync(path.join(root, 'public', 'continuum.html'), 'utf8');
    for (const token of ['askNetworkHint', 'ContinuumScore', 'continuum.visited',
      'migrateLegacyKeys', 'continuum_load', 'from=continuum']) {
      assert.ok(continuum.includes(token), `continuum: ${token}`);
    }
  });

  test('server drops the legacy redirect and brand comments', () => {
    const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    assert.ok(!src.includes('gr' + 'ok-connect'), 'no legacy redirect');
    assert.ok(src.includes('for Continuum Tactical'), 'comment renamed');
  });
});

describe('dead controller tables fully removed', () => {
  test('startup schema has none of the removed tables', () => {
    const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    for (const table of ['pinocch' + 'aio_state', 'pinocch' + 'aio_state_log', 'pinocch' + 'aio_person_state',
      'my_for' + 'ge_sessions', 'artifacts', 'artifact_eve' + 'nts']) {
      assert.ok(!src.includes(table), `server.js: ${table} gone`);
    }
  });

  test('schema.sql drops the tables and columns; kept tables stay', () => {
    const schema = fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8');
    for (const table of ['pinocch' + 'aio_state', 'my_for' + 'ge_sessions', 'artifact_eve' + 'nts',
      'CREATE TABLE IF NOT EXISTS artifacts', 'my_for' + 'ge_unlocked', 'my_for' + 'ge_intro_seen']) {
      assert.ok(!schema.includes(table), `schema: ${table} gone`);
    }
    for (const table of ['forged_qbits', 'operator_ids', 'continuum_results',
      'player_progress', 'learner_profiles', 'events', 'request_log']) {
      assert.ok(schema.includes(table), `schema: ${table} kept`);
    }
  });
});

describe('repo-wide legacy-brand sweep (mirrors the step-18 grep)', () => {
  test('no tracked text file mentions the legacy brands', () => {
    const out = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
    const skipExt = ['.png', '.jpg', '.jpeg', '.mp4', '.webm', '.webp', '.gif', '.mp3', '.wav', '.woff', '.woff2', '.ttf'];
    const offenders = [];
    for (const file of out.split('\n').filter(Boolean)) {
      if (skipExt.some((ext) => file.toLowerCase().endsWith(ext))) continue;
      const full = path.join(root, file);
      let body;
      try {
        body = fs.readFileSync(full, 'utf8');
      } catch (_) {
        continue;
      }
      const lowered = body.toLowerCase();
      for (const word of LEGACY_WORDS) {
        if (lowered.includes(word)) {
          offenders.push(`${file} mentions ${word}`);
          break;
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});
