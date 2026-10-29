'use strict';
// Hackathon step 19f: the Invent request gets its own Forge card.
// The Continuum banner button used to send the player to /forge.html with no
// ?mission=, so the Forge bounced them to Resonance with no guidance. Now it
// goes to /resonance.html#forge, where a sixth mission card shows the active
// Invent request; clicking it routes through guardian selection to a Forge
// page whose mission can produce the needed capabilities (chosen from the
// solver's forgeability proof, behind the scenes). Saves stay origin
// 'continuum' without touching the mission slot, and the trip returns to the
// same challenge id.
// (node:test + node:assert only). No network, no PGlite.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const target = require('../public/js/invent-forge-target');
const serverMissions = require('../server/machine-context').MISSIONS;

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Sample Invent challenge: invent role needs tunnel + collapse.
const SAMPLE = {
  id: 'inv-19f',
  title: 'Silent Passage',
  mode: 'invent',
  roles: [
    { id: 'r1', name: 'Relay', req: ['phase-lock'], needs: 'Needs a Qbit that can keep quantum states synchronized until energy is released on cue' },
    { id: 'r2', name: 'Ghost Lock', reqAll: ['tunnel', 'collapse'], needs: 'Must create a tunneling pathway through a barrier and end the overlap and keep one clear result (one Qbit does both)' },
  ],
};

describe('solver target choice', () => {
  test('reads the invent combo from the reqAll role', () => {
    assert.deepEqual(target.inventComboTags(SAMPLE), ['tunnel', 'collapse']);
    assert.equal(target.inventComboTags({ roles: [{ req: ['x'] }] }), null);
    assert.equal(target.inventComboTags(null), null);
  });

  test('sample challenge routes to stealth_masking via refrax', () => {
    assert.deepEqual(target.chooseInventForgeTarget(SAMPLE), {
      mission: 'stealth_masking',
      guardian: 'refrax',
    });
  });

  test('the combo boost wins over fix overlap', () => {
    const combo = {
      id: 'inv-x', title: 'X', mode: 'invent',
      roles: [{ id: 'r1', req: ['ground'] }, { id: 'r2', reqAll: ['entangle', 'collapse'] }],
    };
    // No solution pairs EN≡ with C//; entanglement is still the only page
    // whose boost can produce 'entangle'.
    assert.deepEqual(target.chooseInventForgeTarget(combo), {
      mission: 'entanglement',
      guardian: 'refrax',
    });
  });

  test('garbage challenge yields no target', () => {
    assert.equal(target.chooseInventForgeTarget({ id: 'x' }), null);
  });

  test('mission solutions match the server table', () => {
    for (const mission of target.MISSION_ORDER) {
      const local = target.MISSION_SOLUTIONS[mission].map((s) => ({
        fixes: s.fixes.slice().sort(), boost: s.boost,
      }));
      const server = serverMissions[mission].solutions.map((s) => ({
        fixes: s.fixes.slice().sort(), boost: s.boost,
      }));
      assert.deepEqual(local, server, `${mission} solutions match`);
    }
  });
});

describe('full invent path in code', () => {
  test('Continuum banner button goes to resonance #forge', () => {
    const src = read('public/continuum.html');
    assert.ok(src.includes("location.href = '/resonance.html#forge'"), 'banner target');
  });

  test('Resonance renders the request card after Stealth', () => {
    const src = read('public/resonance.html');
    for (const token of ['mission-slot-invent', 'CONTINUUM REQUEST', 'NEW INVENTION NEEDED',
      'pulse-request', 'prefers-reduced-motion', 'continuum.inventChallenge',
      'chooseInventForgeTarget', 'forge-guardian-select.html?mission=', '&guardian=',
      'id="forge"', "location.hash === '#forge'"]) {
      assert.ok(src.includes(token), `resonance: ${token}`);
    }
    assert.ok(src.includes('/js/invent-forge-target.js'), 'module loaded');
  });

  test('guardian selection routes a chosen guardian behind the scenes', () => {
    const src = read('public/forge-guardian-select.html');
    assert.ok(src.includes("get('guardian')"), 'reads the guardian param');
    assert.ok(src.includes('location.replace'), 'auto-routes without a back-trap');
    assert.ok(src.includes('?mission='), 'mission param forwarded');
  });

  test('saves stay origin continuum and never replace the mission slot', () => {
    const store = read('public/js/forged-qbits-store.js');
    assert.ok(store.includes('continuum.inventChallenge'), 'sees the active request');
    assert.ok(store.includes("origin = 'continuum'"), 'saves as a Continuum Qbit');
    const writer = read('server/forged-qbits-write.js');
    assert.equal(writer.split('ON CONFLICT').length - 1, 1, 'only the forged branch upserts');
  });

  test('return trip reloads the same challenge id', () => {
    const request = read('public/js/continuum-request.js');
    assert.ok(request.includes('Return to the Continuum'), 'return button offered');
    const continuum = read('public/continuum.html');
    assert.ok(continuum.includes('loadStoredInventChallenge'), 'resume path reads storage');
    assert.ok(continuum.includes('applyServerMission(resumedInvent)'), 'same challenge resumes');
    assert.ok(continuum.includes('continuum.newQbitId'), 'new Qbit tagged');
  });
});
