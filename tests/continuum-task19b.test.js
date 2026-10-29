'use strict';
// Hackathon step 19b: the Forge Machine recognizes fix and boost codes.
// Asked "what is i apply sh?" it used to reply "I do not know what you mean
// by sh." The canonical code vocabulary (names from the forge pages, function
// phrases from the shared TAG_PHRASES map) is now matched case-insensitively
// in the player's question and added to the Machine's context. The Machine
// may explain what a code does, but never which part it belongs on: the
// existing fix+part guard still rejects such pairings.
// (node:test + node:assert only). No network, no PGlite.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const machine = require('../server/machine-context');
const guide = require('../server/guide');
const shared = require('../public/js/continuum-capabilities');

const codesOf = (q) => machine.findCodesInQuestion(q).map((e) => e.code);

describe('findCodesInQuestion matches codes case-insensitively', () => {
  test('the reported question and sh case variants', () => {
    assert.deepEqual(codesOf('what is i apply sh?'), ['SH']);
    assert.deepEqual(codesOf('what is sh?'), ['SH']);
    assert.deepEqual(codesOf('what is Sh?'), ['SH']);
    assert.deepEqual(codesOf('WHAT IS SH?'), ['SH']);
  });

  test('every fix and boost code form', () => {
    assert.deepEqual(codesOf('what does n0 do?'), ['N0']);
    assert.deepEqual(codesOf('try f:: here'), ['F::']);
    assert.deepEqual(codesOf('and C//?'), ['C//']);
    assert.deepEqual(codesOf('what is ph?'), ['PH~']);
    assert.deepEqual(codesOf('use PH~ now'), ['PH~']);
    assert.deepEqual(codesOf('what is en?'), ['EN≡']);
    assert.deepEqual(codesOf('use EN≡ now'), ['EN≡']);
    assert.deepEqual(codesOf('what is g0?'), ['G0']);
  });

  test('several codes in one question, vocab order, no duplicates', () => {
    assert.deepEqual(codesOf('sh or n0 or SH?'), ['SH', 'N0']);
  });

  test('no false positives inside ordinary words', () => {
    assert.deepEqual(codesOf('should i switch?'), []);
    assert.deepEqual(codesOf('what is the phase?'), []);
    assert.deepEqual(codesOf('energy is low'), []);
    assert.deepEqual(codesOf('no, go on'), []);
    assert.deepEqual(codesOf('what is not working'), []);
  });
});

describe('code vocabulary in the Machine context', () => {
  const BUILD = {
    missionId: 'entanglement',
    missionName: 'Entanglement',
    parts: [], fixes: [], boost: null, testResult: '',
    question: 'what is sh?',
  };

  test('canonical names for all seven codes', () => {
    const names = {};
    for (const entry of machine.CODE_VOCAB) names[entry.code] = entry.name;
    assert.deepEqual(names, {
      'SH': 'Superpose',
      'F::': 'FringeGate',
      'C//': 'Collapse',
      'PH~': 'PhaseLock',
      'N0': 'Null',
      'EN≡': 'Entangle',
      'G0': 'Ghost',
    });
  });

  test('asked codes render with the shared canonical phrases', () => {
    const user = machine.buildMachineUserMessage({ ...BUILD, question: 'what does n0 do?' });
    assert.ok(user.includes('CODE VOCABULARY'), 'vocab block present');
    assert.ok(user.includes('N0 Null (boost)'), 'code name and kind');
    assert.ok(user.includes(shared.TAG_PHRASES.ground), 'canonical ground phrase');
    const userSh = machine.buildMachineUserMessage(BUILD);
    assert.ok(userSh.includes('SH Superpose (fix)'), 'fix code line');
    assert.ok(userSh.includes(shared.TAG_PHRASES.superposition), 'canonical superposition phrase');
  });

  test('no vocab block when the question names no code', () => {
    const user = machine.buildMachineUserMessage({ ...BUILD, question: 'what is not working' });
    assert.ok(!user.includes('CODE VOCABULARY'), 'no vocab block');
    assert.ok(!user.includes('Superpose'), 'no code names leak in');
  });

  test('system prompt allows explaining codes, never placing them', () => {
    assert.ok(
      machine.MACHINE_SYSTEM_PROMPT.includes('explain what it does from the CODE VOCABULARY'),
      'may explain asked codes',
    );
    assert.ok(
      machine.MACHINE_SYSTEM_PROMPT.includes('never which part it belongs on'),
      'never places codes on parts',
    );
  });
});

describe('existing fix+part guard still holds', () => {
  test('a code paired with a part name is rejected', () => {
    assert.equal(guide.violatesGuideRules('Put SH on the Shimmer Splitter.'), 'fix-part');
    assert.equal(guide.violatesGuideRules('F:: goes on the Readout.'), 'fix-part');
  });

  test('a pure code explanation passes', () => {
    assert.equal(guide.violatesGuideRules('SH holds every path open at once.'), null);
  });
});
