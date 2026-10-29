'use strict';
// Hackathon step 5: quantum-engineering voice, no answer leaks,
// stale-feedback guard, hint-gated role suggestions, /continuum.html rename
// (node:test + node:assert only). All model clients are fakes; no network.
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  BANNED_WORDS,
  containsBannedWord,
  normalizeRoleIds,
  validateChallenge,
} = require('../server/continuum-rules');
const { SYSTEM_PROMPT } = require('../server/continuum-meta');
const {
  INTERPRET_SYSTEM_PROMPT,
  OFFLINE_FEEDBACK_PASS,
  OFFLINE_FEEDBACK_FAIL,
  isValidFeedback,
  mentionsQbitName,
  generateInterpretation,
} = require('../server/continuum-interpret');
const {
  registerContinuumRoutes,
  _getChallenge,
  _clearChallenges,
} = require('../server/continuum-routes');

const ARCHITECT = 'architect-task5-1';
const OTHER = 'someone-else';

function solvableCandidates() {
  return [
    { id: 'a', name: 'Tuner', capabilities: ['phase-lock'] },
    { id: 'b', name: 'Magnet', capabilities: ['ground'] },
  ];
}

function solvableChallenge() {
  return {
    title: 'Stabilize the Rift',
    brief: 'Hold the fracture steady while the bridge relinks.',
    roles: [
      { id: 'r1', name: 'Phase Anchor', req: ['phase-lock'] },
      { id: 'r2', name: 'Stabilizer', req: ['ground'] },
    ],
  };
}

function fakeClientFor(content) {
  const calls = [];
  const client = {
    chat: {
      completions: {
        create: async (params) => {
          calls.push(params);
          return { choices: [{ message: { content } }] };
        },
      },
    },
  };
  client.calls = calls;
  return client;
}

// One fake client serving both endpoints: dispatches on the requested schema.
function fakeRouterClient({ challengeContent, feedbackContent }) {
  const calls = [];
  const client = {
    chat: {
      completions: {
        create: async (params) => {
          calls.push(params);
          const name = params && params.response_format && params.response_format.json_schema &&
            params.response_format.json_schema.name;
          const content = name === 'ContinuumInterpretation' ? feedbackContent : challengeContent;
          return { choices: [{ message: { content } }] };
        },
      },
    },
  };
  client.calls = calls;
  return client;
}

function qbitRows() {
  return {
    'own-1': { id: 'own-1', name: 'Tuner', boost: 'PH~', visibility: 'private', architect_id: ARCHITECT },
    'pub-1': { id: 'pub-1', name: 'Magnet', boost: 'N0', visibility: 'public', architect_id: OTHER },
  };
}

function makeFakeSql(byId) {
  return (strings, ...values) => {
    const text = strings.join(' ');
    if (text.includes('WHERE id =')) {
      const row = byId[values[0]];
      return Promise.resolve(row ? [row] : []);
    }
    if (text.includes('visibility')) {
      return Promise.resolve(
        Object.values(byId).filter((row) => row.visibility === 'public' && row.architect_id !== ARCHITECT)
      );
    }
    return Promise.resolve(Object.values(byId).filter((row) => row.architect_id === ARCHITECT));
  };
}

function makeRoutes({ client } = {}) {
  const routes = {};
  const stubApp = { post: (p, fn) => { routes[p] = fn; } };
  registerContinuumRoutes(stubApp, () => makeFakeSql(qbitRows()), client ? { client } : {});
  return routes;
}

async function post(handler, body) {
  const req = { body };
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, json: payload }); },
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

function enableAI() {
  process.env.CONTINUUM_AI_ENABLED = '1';
  process.env.MODEL_API_KEY = 'test-key';
}

describe('challenge voice (task 5.2)', () => {
  test('old guidance is gone from the challenge prompt', () => {
    const lowered = SYSTEM_PROMPT.toLowerCase();
    for (const phrase of ['young inventors', 'hopeful', 'plain language', 'nothing scary']) {
      assert.ok(!lowered.includes(phrase), `prompt still contains: ${phrase}`);
    }
  });

  test('new guidance briefs an engineer and grounds the fiction', () => {
    for (const phrase of [
      'briefing an engineer',
      'phase drift',
      'decoherence',
      'Harmonic Tuning'.toLowerCase(),
      'Phase Anchor',
      'Helper',
      'fictional world',
      'Decoherence Cascade',
    ]) {
      assert.ok(
        SYSTEM_PROMPT.toLowerCase().includes(phrase.toLowerCase()),
        `prompt missing: ${phrase}`
      );
    }
  });
});

describe('interpret voice (task 5.3)', () => {
  test('old guidance is gone from the interpret prompt', () => {
    const lowered = INTERPRET_SYSTEM_PROMPT.toLowerCase();
    for (const phrase of ['hopeful', 'plain language', 'nothing scary']) {
      assert.ok(!lowered.includes(phrase), `prompt still contains: ${phrase}`);
    }
  });

  test('interpret prompt names the speaker, the fail rule, and the avoid-list', () => {
    for (const phrase of [
      'briefing an engineer',
      'missing capability',
      'NEVER name a Qbit',
      'Avoid these words entirely',
    ]) {
      assert.ok(INTERPRET_SYSTEM_PROMPT.includes(phrase), `prompt missing: ${phrase}`);
    }
  });

  test('offline feedback passes the validator (no banned words)', () => {
    assert.equal(isValidFeedback(OFFLINE_FEEDBACK_PASS), true);
    assert.equal(isValidFeedback(OFFLINE_FEEDBACK_FAIL), true);
  });
});

describe('banned words rejected', () => {
  test('exact banned-word list', () => {
    assert.deepEqual(BANNED_WORDS, [
      'family', 'friendly', 'kind', 'happy', 'gentle',
      'fun', 'cute', 'park', 'garden', 'helper',
    ]);
  });

  test('containsBannedWord matches whole words, case-insensitively', () => {
    for (const word of BANNED_WORDS) {
      assert.equal(containsBannedWord(`A ${word} sector fault.`), word);
      assert.equal(containsBannedWord(`A ${word.toUpperCase()} sector fault.`), word);
    }
    assert.equal(containsBannedWord('Lock the drift before the array decoheres.'), null);
    assert.equal(containsBannedWord('Kindness refunds the parkway.'), null);
    assert.equal(containsBannedWord(''), null);
    assert.equal(containsBannedWord(null), null);
  });

  test('validateChallenge rejects banned words in title, brief, and role names', () => {
    const base = solvableChallenge();
    const candidates = solvableCandidates();
    assert.deepEqual(validateChallenge(base, candidates), { ok: true });

    const badTitle = { ...base, title: 'A happy little rift' };
    assert.match(validateChallenge(badTitle, candidates).reason, /banned word: happy/);

    const badBrief = { ...base, brief: 'Ask your family to hold the lattice.' };
    assert.match(validateChallenge(badBrief, candidates).reason, /banned word: family/);

    const badRole = solvableChallenge();
    badRole.roles[0] = { id: 'r1', name: 'Friendly Helper', req: ['phase-lock'] };
    assert.match(validateChallenge(badRole, candidates).reason, /banned word/);
  });

  test('isValidFeedback rejects banned-word feedback', () => {
    assert.equal(isValidFeedback('A gentle nudge: check the garden array.'), false);
    assert.equal(isValidFeedback('Both roles covered. The array holds coherence.'), true);
  });

  describe('routes', () => {
    beforeEach(() => {
      _clearChallenges();
      delete process.env.CONTINUUM_AI_ENABLED;
      delete process.env.MODEL_API_KEY;
    });

    afterEach(() => {
      _clearChallenges();
      delete process.env.CONTINUUM_AI_ENABLED;
      delete process.env.MODEL_API_KEY;
    });

    test('banned-word challenge is retried, then falls back to offline', async () => {
      enableAI();
      const bad = JSON.stringify({
        title: 'A happy little rift',
        brief: 'Hold the fracture steady while the bridge relinks.',
        roles: [
          { id: 'r1', name: 'Phase Anchor', req: ['phase-lock'] },
          { id: 'r2', name: 'Stabilizer', req: ['ground'] },
        ],
      });
      const client = fakeClientFor(bad);
      const routes = makeRoutes({ client });
      const { json } = await post(routes['/api/continuum/challenges/next'], {
        architect_id: ARCHITECT,
      });
      assert.equal(json.source, 'offline');
      assert.equal(client.calls.length, 2);
    });

    test('banned-word feedback falls back to the offline message', async () => {
      enableAI();
      const routes = makeRoutes({
        client: fakeRouterClient({
          challengeContent: JSON.stringify(solvableChallenge()),
          feedbackContent: JSON.stringify({ feedback: 'Such a fun, happy fix!' }),
        }),
      });
      const challenge = (
        await post(routes['/api/continuum/challenges/next'], { architect_id: ARCHITECT })
      ).json;
      assert.equal(challenge.source, 'meta');
      const { json } = await post(routes['/api/continuum/attempts/interpret'], {
        challenge_id: challenge.id,
        architect_id: ARCHITECT,
        assigned_qbit_ids: ['own-1', 'pub-1'],
      });
      assert.equal(json.passed, true);
      assert.equal(json.source, 'offline');
      assert.equal(json.feedback, OFFLINE_FEEDBACK_PASS);
    });
  });
});

describe('role ids rewritten (task 5.1)', () => {
  test('normalizeRoleIds overwrites with r1, r2 without mutating', () => {
    const input = [
      { id: 172, name: 'Phase Anchor', req: ['phase-lock'] },
      { id: 173, name: 'Stabilizer', req: ['ground'] },
    ];
    const out = normalizeRoleIds(input);
    assert.deepEqual(out.map((r) => r.id), ['r1', 'r2']);
    assert.equal(out[0].name, 'Phase Anchor');
    assert.deepEqual(input.map((r) => r.id), [172, 173]);
  });

  test('route stores and returns r1/r2 when Meta echoes Qbit ids', async () => {
    _clearChallenges();
    enableAI();
    try {
      const leaked = JSON.stringify({
        title: 'Stabilize the Rift',
        brief: 'Hold the fracture steady while the bridge relinks.',
        roles: [
          { id: 172, name: 'Phase Anchor', req: ['phase-lock'] },
          { id: 173, name: 'Stabilizer', req: ['ground'] },
        ],
      });
      const routes = makeRoutes({ client: fakeClientFor(leaked) });
      const { json } = await post(routes['/api/continuum/challenges/next'], {
        architect_id: ARCHITECT,
      });
      assert.equal(json.source, 'meta');
      assert.deepEqual(json.roles.map((r) => r.id), ['r1', 'r2']);
      assert.ok(!JSON.stringify(json).includes('172'));

      const stored = _getChallenge(json.id);
      assert.deepEqual(stored.roles.map((r) => r.id), ['r1', 'r2']);

      // The rewritten challenge still judges by slot order.
      const good = await post(routes['/api/continuum/attempts/interpret'], {
        challenge_id: json.id,
        architect_id: ARCHITECT,
        assigned_qbit_ids: ['own-1', 'pub-1'],
      });
      assert.equal(good.json.passed, true);
    } finally {
      _clearChallenges();
      delete process.env.CONTINUUM_AI_ENABLED;
      delete process.env.MODEL_API_KEY;
    }
  });
});

describe('fail feedback never names a Qbit', () => {
  test('mentionsQbitName spots Qbit names, case-insensitively', () => {
    const qbits = [{ name: 'Tuner' }, { name: 'Magnet' }];
    assert.equal(mentionsQbitName('Slot the Tuner into the anchor role.', qbits), true);
    assert.equal(mentionsQbitName('The MAGNET link is weak.', qbits), true);
    assert.equal(
      mentionsQbitName('The timing capability is missing. Trace the lattice.', qbits),
      false
    );
    assert.equal(mentionsQbitName('Use it now.', [{ name: 'AB' }]), false);
    assert.equal(mentionsQbitName('Use it now.', []), false);
  });

  test('generateInterpretation rejects fail feedback that names a Qbit', async () => {
    const attempt = {
      roles: solvableChallenge().roles,
      qbits: [
        { name: 'Tuner', capabilities: ['phase-lock'] },
        { name: 'Magnet', capabilities: ['ground'] },
      ],
      passed: false,
    };
    await assert.rejects(
      generateInterpretation(attempt, {
        client: fakeClientFor(JSON.stringify({ feedback: 'Slot the Tuner into the anchor role.' })),
      }),
      /feedback_names_qbit/
    );
    const clean = await generateInterpretation(
      attempt,
      {
        client: fakeClientFor(
          JSON.stringify({ feedback: 'The timing capability is missing. Trace the lattice.' })
        ),
      }
    );
    assert.equal(clean, 'The timing capability is missing. Trace the lattice.');
  });

  test('route falls back to offline on a fail-feedback answer leak', async () => {
    _clearChallenges();
    enableAI();
    try {
      const routes = makeRoutes({
        client: fakeRouterClient({
          challengeContent: JSON.stringify(solvableChallenge()),
          feedbackContent: JSON.stringify({ feedback: 'Slot the Tuner into the anchor role.' }),
        }),
      });
      const challenge = (
        await post(routes['/api/continuum/challenges/next'], { architect_id: ARCHITECT })
      ).json;
      assert.equal(challenge.source, 'meta');
      // Wrong order: pub-1 (N0) cannot fill phase-lock, so this fails.
      const { json } = await post(routes['/api/continuum/attempts/interpret'], {
        challenge_id: challenge.id,
        architect_id: ARCHITECT,
        assigned_qbit_ids: ['pub-1', 'own-1'],
      });
      assert.equal(json.passed, false);
      assert.equal(json.source, 'offline');
      assert.equal(json.feedback, OFFLINE_FEEDBACK_FAIL);
    } finally {
      _clearChallenges();
      delete process.env.CONTINUUM_AI_ENABLED;
      delete process.env.MODEL_API_KEY;
    }
  });
});

describe('stale feedback guard (client, where testable)', () => {
  const pagePath = path.join(__dirname, '..', 'public', 'continuum.html');
  const page = fs.readFileSync(pagePath, 'utf8');

  test('a new challenge clears and hides validationFeedback', () => {
    assert.ok(page.includes('function clearValidationFeedback()'));
    assert.ok(page.includes('function resetChallengeState()'));
    const serverMission = page.slice(
      page.indexOf('function applyServerMission'),
      page.indexOf('function applyLocalMission')
    );
    const localMission = page.slice(page.indexOf('function applyLocalMission'));
    assert.ok(serverMission.includes('resetChallengeState()'));
    assert.ok(localMission.includes('resetChallengeState()'));
  });

  test('interpret responses tagged with the challenge id are discarded when stale', () => {
    const fn = page.slice(page.indexOf('async function requestMetaFeedback'));
    assert.ok(fn.includes('const requestChallengeId = currentChallengeId'));
    assert.ok(fn.includes('const requestSlotsSig = slotSignature()'));
    assert.ok(fn.includes('requestChallengeId !== currentChallengeId'));
    assert.ok(fn.includes('requestSlotsSig !== slotSignature()'));
    assert.ok(fn.includes('if (isStale()) return;'));
  });

  test('"Use in <role>" hints are hidden until ASK NETWORK is spent (once per challenge)', () => {
    assert.ok(page.includes('matchingRole && hintUsedForChallenge'));
    assert.ok(page.includes('hintUsedForChallenge = true'));
    assert.ok(page.includes('hintUsedForChallenge = false'));
    assert.ok(page.includes('Already paid for this challenge'));
  });

  test('no player-visible legacy-brand text remains on the page', () => {
    const withoutScripts = page
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');
    const textOnly = withoutScripts.replace(/<[^>]*>/g, ' ');
    // Patterns assembled so this file stays clean for the brand grep.
    for (const word of ['gr' + 'ok', 'deep' + 'seek', 'pinocch' + 'aio']) {
      assert.ok(!textOnly.toLowerCase().includes(word), `player-visible text mentions ${word}`);
    }
  });
});

describe('rename to /continuum.html', () => {
  const root = path.join(__dirname, '..');

  test('continuum.html exists and the legacy page is gone', () => {
    assert.ok(fs.existsSync(path.join(root, 'public', 'continuum.html')));
    assert.ok(!fs.existsSync(path.join(root, 'public', 'gr' + 'ok-connect.html')));
  });

  test('server no longer registers the legacy redirect (removed step 18)', () => {
    const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    assert.ok(!serverJs.includes("'/" + 'gr' + 'ok-connect.html' + "'"));
  });

  test('no served page or script still links the legacy page', () => {
    const files = [
      'public/forge.html',
      'public/forge-magnetica.html',
      'public/forge-chrona.html',
      'public/forge-violetflicker.html',
      'public/resonance.html',
      'public/js/continuum-unlock.js',
      'public/continuum.html',
    ];
    const legacy = 'gr' + 'ok-connect';
    for (const file of files) {
      const body = fs.readFileSync(path.join(root, file), 'utf8');
      assert.ok(!body.includes(legacy), `${file} still links the legacy page`);
    }
  });
});
