'use strict';
// Hackathon step 10: The Machine sees the player's build plus a
// principle-level gap diagnosis, without answers.
// (node:test + node:assert only). All model clients are fakes; no network.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MACHINE_MAX_TOKENS,
  MACHINE_SYSTEM_PROMPT,
  MISSIONS,
  PARTS,
  FIXES,
  BOOSTS,
  matchExactSolution,
  closestSolution,
  fixCue,
  diagnose,
  buildMachineUserMessage,
  buildMachineMessages,
  machineProbe,
} = require('../server/machine-context');

// Live-check build: entanglement, closest to Optical Twin but no Lock part
// and the wrong boost principle.
const LIVE_BUILD = {
  missionId: 'entanglement',
  missionName: 'Entanglement',
  parts: ['Shimmer Splitter', 'Choice Buffer', 'Delay Gate'],
  fixes: ['SH', 'F::'],
  boost: 'N0',
  testResult: 'It runs, but it is not fully optimized yet',
  question: 'what is not working',
};

const SELECTED_PARTS = ['Shimmer Splitter', 'Choice Buffer', 'Delay Gate'];
const UNSELECTED_PARTS = ['Field Mirror', 'Phase Prism', 'Coil Phase', 'Readout', 'Hall Sensor', 'Light Catcher'];
const UNSELECTED_PART_IDS = ['field_mirror', 'phase_prism', 'coil_phase', 'readout', 'hall_sensor', 'light_catcher'];

const SOLUTION_IDS = [
  'harmonic_optical', 'harmonic_magnetic',
  'entangle_optical', 'entangle_stable',
  'coherence_magnetic', 'coherence_optical',
  'absorption_timing', 'absorption_magnetic',
  'stealth_optical', 'stealth_timing',
];
const SOLUTION_NAMES = [
  'Optical Harmonic', 'Magnetic Harmonic',
  'Optical Twin', 'Grounded Twin',
  'Magnetic Weave', 'Optical Repair',
  'Timing Drain', 'Magnetic Damping',
  'Optical Mask', 'Timing Slip',
];

function fakeClient(script, calls) {
  let i = 0;
  return {
    chat: {
      completions: {
        create: async (params) => {
          if (calls) calls.push(params);
          const step = script[Math.min(i, script.length - 1)];
          i += 1;
          return { choices: [{ message: { content: step } }] };
        },
      },
    },
  };
}

describe('machine user message carries the actual build', () => {
  test('includes mission, parts+functions, fixes+meanings, boost+meaning, test result, diagnosis, question', () => {
    const user = buildMachineUserMessage(LIVE_BUILD);
    assert.ok(user.includes('Entanglement'), 'mission name');
    assert.ok(user.includes('distant channels act as one'), 'mission goal');
    assert.ok(user.includes('Shimmer Splitter (Split Signal Paths)'), 'part + function');
    assert.ok(user.includes('Choice Buffer (Hold Signal Open)'), 'part + function');
    assert.ok(user.includes('Delay Gate (Slow Fast Paths)'), 'part + function');
    assert.ok(user.includes('SH (superposition: holds all paths open)'), 'fix + meaning');
    assert.ok(user.includes('F:: (phase-control: shifts interference)'), 'fix + meaning');
    assert.ok(user.includes('N0 (drains excess energy, goes quiet)'), 'boost + meaning');
    assert.ok(user.includes('It runs, but it is not fully optimized yet'), 'test result');
    assert.ok(user.includes('DIAGNOSIS'), 'diagnosis section');
    assert.ok(user.includes('what is not working'), 'player question');
  });

  test('diagnosis covers Open/Align/Lock gap, fix cue fit, boost compatibility', () => {
    const user = buildMachineUserMessage(LIVE_BUILD);
    assert.ok(user.includes('Missing Lock'), 'names the uncovered role');
    assert.ok(user.includes('nothing locks a final result'), 'gap in function terms');
    assert.ok(user.includes("Fixes fit the mission's success cue"), 'fix cue fit');
    assert.ok(user.includes('Boost does not fit'), 'boost mismatch');
    assert.ok(user.includes('links channels so they act together'), 'needed boost in principle terms');
  });

  test('omits the test line when no test result was sent', () => {
    const user = buildMachineUserMessage({ ...LIVE_BUILD, testResult: '' });
    assert.ok(!user.includes('Latest test:'), 'no test line without a result');
    assert.ok(user.includes('DIAGNOSIS'), 'diagnosis still present');
  });
});

describe('model input never carries answers', () => {
  function fullInput(build) {
    return buildMachineMessages(build)
      .map((m) => m.content)
      .join('\n');
  }

  test('no solution lists, ids, or names', () => {
    const input = fullInput(LIVE_BUILD);
    for (const id of SOLUTION_IDS) assert.ok(!input.includes(id), `no solution id ${id}`);
    for (const name of SOLUTION_NAMES) assert.ok(!input.includes(name), `no solution name ${name}`);
  });

  test('no part name or id the player did not select', () => {
    const input = fullInput(LIVE_BUILD);
    for (const name of SELECTED_PARTS) assert.ok(input.includes(name), `selected part ${name} present`);
    for (const name of UNSELECTED_PARTS) assert.ok(!input.includes(name), `no unselected part ${name}`);
    for (const id of UNSELECTED_PART_IDS) assert.ok(!input.includes(id), `no unselected part id ${id}`);
  });

  test('no unselected fix or boost symbol', () => {
    const input = fullInput(LIVE_BUILD);
    assert.ok(input.includes('SH') && input.includes('F::'), 'selected fixes present');
    assert.ok(input.includes('N0'), 'selected boost present');
    assert.ok(!input.includes('C//'), 'no unselected fix C//');
    assert.ok(!input.includes('EN≡'), 'no unselected boost EN≡');
    assert.ok(!input.includes('PH~'), 'no unselected boost PH~');
    assert.ok(!input.includes('G0'), 'no unselected boost G0');
  });
});

describe('diagnose() gap logic', () => {
  test('live build: Lock missing, fixes fit, boost incompatible, not exact', () => {
    const result = diagnose('entanglement', {
      parts: LIVE_BUILD.parts, fixes: LIVE_BUILD.fixes, boost: LIVE_BUILD.boost,
    });
    assert.deepEqual(result.rolesMissing, ['Lock']);
    assert.equal(result.fixesFit, true);
    assert.equal(result.boostCompatible, false);
    assert.equal(result.exact, false);
  });

  test('exact working build: all roles covered, everything fits', () => {
    const result = diagnose('entanglement', {
      parts: ['shimmer_splitter', 'delay_gate', 'readout'],
      fixes: ['SH', 'F::'],
      boost: 'EN≡',
    });
    assert.deepEqual(result.rolesMissing, []);
    assert.equal(result.fixesFit, true);
    assert.equal(result.boostCompatible, true);
    assert.equal(result.exact, true);
    assert.ok(result.lines.join(' ').includes('Open, Align, and Lock'));
  });

  test('empty build and unknown mission degrade gracefully', () => {
    const empty = diagnose('entanglement', { parts: [], fixes: [], boost: null });
    assert.deepEqual(empty.rolesMissing, ['Open', 'Align', 'Lock']);
    assert.equal(empty.fixesFit, false);
    assert.equal(empty.boostCompatible, false);
    const unknown = diagnose('no_such_mission', {
      parts: ['Readout'], fixes: ['C//'], boost: 'N0',
    });
    assert.ok(unknown.lines.join('\n').includes('mission not recognized'));
  });

  test('missing fix cue is phrased as a principle, never the fix to add', () => {
    const result = diagnose('entanglement', {
      parts: ['Shimmer Splitter', 'Delay Gate', 'Readout'],
      fixes: ['F::', 'C//'],
      boost: 'EN≡',
    });
    assert.equal(result.fixesFit, false);
    const text = result.lines.join('\n');
    assert.ok(text.includes('nothing holds all paths open'), 'missing superposition as principle');
    assert.ok(!text.includes('SH'), 'never names the fix to add');
  });
});

describe('solution matching mirrors the forge pages', () => {
  test('matchExactSolution needs exact parts, fixes, and boost', () => {
    const good = matchExactSolution(
      'entanglement', ['shimmer_splitter', 'delay_gate', 'readout'], ['SH', 'F::'], 'EN≡');
    assert.ok(good && good.boost === 'EN≡', 'exact build matches');
    assert.equal(
      matchExactSolution('entanglement', ['shimmer_splitter', 'delay_gate', 'readout'], ['SH', 'F::'], 'N0'),
      null, 'wrong boost does not match');
    assert.equal(
      matchExactSolution('entanglement', ['shimmer_splitter', 'delay_gate'], ['SH', 'F::'], 'EN≡'),
      null, 'partial parts do not match');
  });

  test('closestSolution picks the best parts overlap, then fixes, then boost', () => {
    const closest = closestSolution(
      'entanglement', ['shimmer_splitter', 'choice_buffer', 'delay_gate'], ['SH', 'F::'], 'N0');
    assert.equal(closest.solution.boost, 'EN≡', 'closest to Optical Twin by parts');
    assert.equal(closest.partsOverlap, 2);
    assert.equal(closestSolution('no_such_mission', [], [], null), null);
  });

  test('fix cue is the principles every solution of the mission shares', () => {
    assert.deepEqual(fixCue('entanglement'), ['superposition']);
    assert.deepEqual(fixCue('harmonic_tuning').sort(), ['collapse', 'phase-control']);
    assert.deepEqual(fixCue('no_such_mission'), []);
  });

  test('server mission data matches the forge pages (5 missions, 2 solutions each)', () => {
    assert.deepEqual(Object.keys(MISSIONS).sort(), [
      'coherence_stitching', 'energy_absorption', 'entanglement', 'harmonic_tuning', 'stealth_masking',
    ]);
    for (const mission of Object.values(MISSIONS)) {
      assert.equal(mission.solutions.length, 2);
    }
    assert.equal(Object.keys(PARTS).length, 9);
    assert.equal(Object.keys(FIXES).length, 3);
    assert.equal(Object.keys(BOOSTS).length, 4);
  });
});

describe('machineProbe() with fake client', () => {
  test('returns the trimmed reply and passes the token budget', async () => {
    const calls = [];
    const probe = await machineProbe(LIVE_BUILD, {
      client: fakeClient(['  The Lock role is uncovered. What measures a final result?  '], calls),
    });
    assert.equal(probe, 'The Lock role is uncovered. What measures a final result?');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].max_completion_tokens, 500);
    assert.equal(calls[0].model, 'muse-spark-1.3');
  });

  test('model input carries build plus diagnosis, without answers', async () => {
    const calls = [];
    await machineProbe(LIVE_BUILD, { client: fakeClient(['ok'], calls) });
    const input = calls[0].messages.map((m) => m.content).join('\n');
    assert.ok(input.includes('Shimmer Splitter'), 'parts in model input');
    assert.ok(input.includes('superposition: holds all paths open'), 'fix meanings in model input');
    assert.ok(input.includes('drains excess energy'), 'boost meaning in model input');
    assert.ok(input.includes('not fully optimized yet'), 'test result in model input');
    assert.ok(input.includes('Missing Lock'), 'diagnosis in model input');
    for (const name of UNSELECTED_PARTS) assert.ok(!input.includes(name), `no ${name}`);
    assert.ok(!input.includes('Optical Twin'), 'no solution name');
    assert.ok(!input.includes('EN≡'), 'no unselected boost');
  });

  test('empty model reply rejects so the route falls back', async () => {
    await assert.rejects(
      machineProbe(LIVE_BUILD, { client: fakeClient(['   ']) }),
      /empty_model_response/
    );
  });
});

describe('Machine system prompt keeps old rules and adds the new ones', () => {
  test('existing Machine rules are kept', () => {
    assert.ok(MACHINE_SYSTEM_PROMPT.includes('You are The Machine'), 'identity kept');
    assert.ok(MACHINE_SYSTEM_PROMPT.includes('Maximum 3 sentences.'), 'length rule kept');
    assert.ok(MACHINE_SYSTEM_PROMPT.includes('No em dashes.'), 'style rule kept');
    assert.ok(MACHINE_SYSTEM_PROMPT.includes('Never reveal which combination solves the mission.'), 'secrecy kept');
    assert.ok(MACHINE_SYSTEM_PROMPT.includes('Never invent lore.'), 'honesty rule kept');
  });

  test('new rules: use the readings, principle terms, never name additions', () => {
    assert.ok(MACHINE_SYSTEM_PROMPT.includes('never say you cannot see them'), 'uses the readings');
    assert.ok(MACHINE_SYSTEM_PROMPT.includes('Explain the gap in principle (function) terms'), 'principle terms');
    assert.ok(MACHINE_SYSTEM_PROMPT.includes('Never name a specific part, fix, or boost to add.'), 'no named additions');
  });
});

describe('server wiring: machine_query uses the build', () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  function routeSpan(routePath) {
    const start = serverSrc.indexOf(`app.post('${routePath}'`);
    assert.ok(start !== -1, `route ${routePath} is registered`);
    const next = serverSrc.indexOf('app.post(', start + 1);
    return serverSrc.slice(start, next === -1 ? undefined : next);
  }

  test('forge-probe routes machine queries to machineProbe with build fields', () => {
    assert.ok(serverSrc.includes("require('./server/machine-context')"), 'loads the Machine module');
    const span = routeSpan('/api/forge-probe');
    assert.ok(span.includes('machineProbe('), 'calls machineProbe');
    assert.ok(span.includes('parts: selected_parts'), 'passes parts');
    assert.ok(span.includes('fixes: selected_fixes'), 'passes fixes');
    assert.ok(span.includes('boost: selected_boost'), 'passes boost');
    assert.ok(span.includes('testResult: test_result'), 'passes the test result');
    assert.ok(span.includes('question: player_question'), 'passes the question');
  });

  test('Socratic probe path is unchanged (prompt, fallbacks, logging)', () => {
    const span = routeSpan('/api/forge-probe');
    assert.ok(span.includes('Ask one precise probing question'), 'Socratic prompt kept');
    assert.ok(span.includes('What happened when you used that fix in the chamber?'), 'catch fallback kept');
    assert.ok(span.includes('[ForgeProbe]'), 'logging kept');
  });
});

describe('client: machine queries send the latest test result (all four forge pages)', () => {
  const PAGES = ['forge.html', 'forge-magnetica.html', 'forge-chrona.html', 'forge-violetflicker.html'];

  for (const page of PAGES) {
    test(`${page}: machine payload includes mission, parts, fixes, boost, and test result`, () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'public', page), 'utf8');
      const at = src.indexOf('function getMachineContext()');
      assert.ok(at !== -1, `${page} has getMachineContext`);
      const span = src.slice(at, at + 1500);
      assert.ok(span.includes('mission_id') && span.includes('mission_name'), `${page} sends the mission`);
      assert.ok(span.includes('selected_parts'), `${page} sends parts`);
      assert.ok(span.includes('selected_fixes'), `${page} sends fixes`);
      assert.ok(span.includes('selected_boost'), `${page} sends boost`);
      assert.ok(span.includes('test_result'), `${page} sends the test result`);
      assert.ok(src.includes('function getLastTestResult()'), `${page} reads the last result`);
      assert.ok(src.includes("getElementById('resultBox')"), `${page} reads resultBox`);
    });
  }
});
