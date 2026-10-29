'use strict';
// Tests for POST /api/continuum/attempts/interpret, the server-side challenge
// memory, the SDK retry budget, and the community seed loader
// (node:test + node:assert only). All model clients are fakes; no network.
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  registerContinuumRoutes,
  MAX_AI_ATTEMPTS,
  CHALLENGE_TOTAL_TIMEOUT_MS,
  MAX_CHALLENGES,
  CHALLENGE_TTL_MS,
  EXPIRED_MESSAGE,
  _challenges,
  _storeChallenge,
  _getChallenge,
  _clearChallenges,
  _challengeCount,
} = require('../server/continuum-routes');
const { createMetaClient } = require('../server/continuum-meta');
const {
  OFFLINE_FEEDBACK_PASS,
  OFFLINE_FEEDBACK_FAIL,
} = require('../server/continuum-interpret');
const { SEED_OWNER_PREFIX, communityOwnerFor, loadCommunityQbits } = require('../db/seed/load-community-qbits');
const seedQbits = require('../db/seed/community-qbits.json');

const ARCHITECT = 'architect-interpret-1';
const OTHER = 'someone-else';

const VALID_CHALLENGE_JSON = JSON.stringify({
  title: 'Steady the Spire',
  brief: 'Hold the spire still while the link bridge reconnects.',
  roles: [
    { id: 'r1', name: 'Phase Anchor', req: ['phase-lock'] },
    { id: 'r2', name: 'Stabilizer', req: ['ground'] },
  ],
});

const EXPIRED_BODY = {
  expired: true,
  message: 'This challenge has faded from the Continuum. Request a new one; your Qbits are safe.',
};

// One fake client serving both endpoints: dispatches on the requested schema.
function fakeRouterClient({ challengeContent, feedbackContent, onCreate } = {}) {
  const calls = [];
  const client = {
    chat: {
      completions: {
        create: async (params) => {
          calls.push(params);
          if (onCreate) onCreate(params);
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

function feedbackClient(feedback, extra = {}) {
  return fakeRouterClient({
    challengeContent: VALID_CHALLENGE_JSON,
    feedbackContent: JSON.stringify({ feedback }),
    ...extra,
  });
}

function qbitRows() {
  return {
    'own-1': { id: 'own-1', name: 'Tuner', boost: 'PH~', visibility: 'private', architect_id: ARCHITECT },
    'pub-1': { id: 'pub-1', name: 'Magnet', boost: 'N0', visibility: 'public', architect_id: OTHER },
    'priv-1': { id: 'priv-1', name: 'Secret', boost: 'G0', visibility: 'private', architect_id: OTHER },
  };
}

// Fake sql handling challenge samples (own/public) and interpret by-id loads.
function makeFakeSql(byId) {
  const fake = (strings, ...values) => {
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
  return fake;
}

function makeRoutes({ client } = {}) {
  const routes = {};
  const stubApp = { post: (path, fn) => { routes[path] = fn; } };
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

async function issueChallenge(routes) {
  const { json } = await post(routes['/api/continuum/challenges/next'], { architect_id: ARCHITECT });
  return json;
}

describe('POST /api/continuum/attempts/interpret', () => {
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

  test('uses server-stored roles: correct pair passes, ignores client-sent roles', async () => {
    enableAI();
    const routes = makeRoutes({ client: feedbackClient('The timing holds the anchor while the magnet steadies all.') });
    const challenge = await issueChallenge(routes);
    assert.equal(challenge.source, 'meta');
    const { status, json } = await post(routes['/api/continuum/attempts/interpret'], {
      challenge_id: challenge.id,
      architect_id: ARCHITECT,
      assigned_qbit_ids: ['own-1', 'pub-1'],
      roles: [{ id: 'r1', name: 'Bogus', req: ['tunnel'] }, { id: 'r2', name: 'Bogus', req: ['tunnel'] }],
    });
    assert.equal(status, 200);
    assert.equal(json.passed, true);
    assert.equal(json.source, 'meta');
    assert.deepEqual(Object.keys(json).sort(), ['feedback', 'passed', 'source']);
  });

  test('wrong pair fails against stored roles (order matters)', async () => {
    enableAI();
    const routes = makeRoutes({ client: feedbackClient('Something is missing.') });
    const challenge = await issueChallenge(routes);
    const { json } = await post(routes['/api/continuum/attempts/interpret'], {
      challenge_id: challenge.id,
      architect_id: ARCHITECT,
      assigned_qbit_ids: ['pub-1', 'own-1'],
    });
    assert.equal(json.passed, false);
  });

  test('unknown challenge_id returns 410 with the exact faded message', async () => {
    enableAI();
    const routes = makeRoutes({ client: feedbackClient('Never used.') });
    const { status, json } = await post(routes['/api/continuum/attempts/interpret'], {
      challenge_id: 'no-such-challenge',
      architect_id: ARCHITECT,
      assigned_qbit_ids: ['own-1', 'pub-1'],
    });
    assert.equal(status, 410);
    assert.deepEqual(json, EXPIRED_BODY);
    assert.equal(EXPIRED_MESSAGE, EXPIRED_BODY.message);
  });

  test('expired challenge returns 410 and is forgotten', async () => {
    enableAI();
    const routes = makeRoutes({ client: feedbackClient('Never used.') });
    const challenge = await issueChallenge(routes);
    _challenges.get(challenge.id).expiresAt = Date.now() - 1;
    const { status, json } = await post(routes['/api/continuum/attempts/interpret'], {
      challenge_id: challenge.id,
      architect_id: ARCHITECT,
      assigned_qbit_ids: ['own-1', 'pub-1'],
    });
    assert.equal(status, 410);
    assert.deepEqual(json, EXPIRED_BODY);
    assert.equal(_getChallenge(challenge.id), null);
  });

  test("private Qbit of another player is rejected with 400", async () => {
    enableAI();
    const routes = makeRoutes({ client: feedbackClient('Never used.') });
    const challenge = await issueChallenge(routes);
    const { status } = await post(routes['/api/continuum/attempts/interpret'], {
      challenge_id: challenge.id,
      architect_id: ARCHITECT,
      assigned_qbit_ids: ['own-1', 'priv-1'],
    });
    assert.equal(status, 400);
  });

  test('unknown qbit id and malformed bodies are rejected with 400', async () => {
    enableAI();
    const routes = makeRoutes({ client: feedbackClient('Never used.') });
    const challenge = await issueChallenge(routes);
    const interpret = routes['/api/continuum/attempts/interpret'];
    const bad = [
      { challenge_id: challenge.id, architect_id: ARCHITECT, assigned_qbit_ids: ['own-1', 'ghost'] },
      { challenge_id: challenge.id, architect_id: ARCHITECT, assigned_qbit_ids: ['own-1'] },
      { challenge_id: challenge.id, architect_id: ARCHITECT },
      { architect_id: ARCHITECT, assigned_qbit_ids: ['own-1', 'pub-1'] },
      { challenge_id: challenge.id, assigned_qbit_ids: ['own-1', 'pub-1'] },
    ];
    for (const body of bad) {
      const { status } = await post(interpret, body);
      assert.equal(status, 400);
    }
  });

  test('pass/fail comes from rules even if the fake model claims otherwise', async () => {
    enableAI();
    const routes = makeRoutes({
      client: feedbackClient('Your pairing passed brilliantly, a perfect triumph.'),
    });
    const challenge = await issueChallenge(routes);
    const interpret = routes['/api/continuum/attempts/interpret'];
    const failed = await post(interpret, {
      challenge_id: challenge.id,
      architect_id: ARCHITECT,
      assigned_qbit_ids: ['pub-1', 'own-1'],
    });
    assert.equal(failed.json.passed, false);
    assert.equal(failed.json.feedback, 'Your pairing passed brilliantly, a perfect triumph.');

    const routes2 = makeRoutes({ client: feedbackClient('Total failure, nothing fits at all.') });
    const challenge2 = await issueChallenge(routes2);
    const passed = await post(routes2['/api/continuum/attempts/interpret'], {
      challenge_id: challenge2.id,
      architect_id: ARCHITECT,
      assigned_qbit_ids: ['own-1', 'pub-1'],
    });
    assert.equal(passed.json.passed, true);
  });

  test('bad model feedback falls back to the fixed offline message', async () => {
    enableAI();
    for (const bad of ['Fix it <now> fast', 'x'.repeat(241), 'See http://example.com for help', 42, '']) {
      const routes = makeRoutes({
        client: fakeRouterClient({
          challengeContent: VALID_CHALLENGE_JSON,
          feedbackContent: JSON.stringify({ feedback: bad }),
        }),
      });
      const challenge = await issueChallenge(routes);
      const { json } = await post(routes['/api/continuum/attempts/interpret'], {
        challenge_id: challenge.id,
        architect_id: ARCHITECT,
        assigned_qbit_ids: ['own-1', 'pub-1'],
      });
      assert.equal(json.passed, true);
      assert.equal(json.source, 'offline');
      assert.equal(json.feedback, OFFLINE_FEEDBACK_PASS);
    }
  });

  test('interpret makes exactly one Meta call (no retry), capped at 400 tokens of JSON', async () => {
    enableAI();
    const client = feedbackClient('Steady work, young inventor.');
    const routes = makeRoutes({ client });
    const challenge = await issueChallenge(routes);
    const before = client.calls.length;
    await post(routes['/api/continuum/attempts/interpret'], {
      challenge_id: challenge.id,
      architect_id: ARCHITECT,
      assigned_qbit_ids: ['own-1', 'pub-1'],
    });
    const interpretCalls = client.calls.slice(before);
    assert.equal(interpretCalls.length, 1);
    assert.equal(interpretCalls[0].max_completion_tokens, 400);
    assert.equal(interpretCalls[0].response_format.type, 'json_schema');
  });

  test('offline source with fixed messages when AI is disabled', async () => {
    const routes = makeRoutes();
    const challenge = await issueChallenge(routes);
    assert.equal(challenge.source, 'offline');
    const interpret = routes['/api/continuum/attempts/interpret'];
    const attempt = await post(interpret, {
      challenge_id: challenge.id,
      architect_id: ARCHITECT,
      assigned_qbit_ids: ['own-1', 'pub-1'],
    });
    assert.equal(attempt.json.source, 'offline');
    // Offline templates are picked at random; own-1 (PH~) + pub-1 (N0) covers
    // the first template only, so either fixed message is acceptable here.
    assert.equal(
      attempt.json.feedback,
      attempt.json.passed ? OFFLINE_FEEDBACK_PASS : OFFLINE_FEEDBACK_FAIL
    );
    const failed = await post(interpret, {
      challenge_id: challenge.id,
      architect_id: ARCHITECT,
      assigned_qbit_ids: ['own-1', 'own-1'],
    });
    assert.equal(failed.json.passed, false);
    assert.equal(failed.json.source, 'offline');
    assert.equal(failed.json.feedback, OFFLINE_FEEDBACK_FAIL);
  });
});

describe('challenge memory', () => {
  beforeEach(() => _clearChallenges());
  afterEach(() => _clearChallenges());

  test('2-hour expiry and 500-entry cap', () => {
    assert.equal(CHALLENGE_TTL_MS, 2 * 60 * 60 * 1000);
    assert.equal(MAX_CHALLENGES, 500);
    _storeChallenge('a', [{ id: 'r1', name: 'R', req: ['phase-lock'] }], ['x']);
    assert.ok(_getChallenge('a'));
    for (let i = 0; i < 501; i++) {
      _storeChallenge(`cap-${i}`, [{ id: 'r1', name: 'R', req: ['phase-lock'] }], ['x']);
    }
    assert.ok(_challengeCount() <= 500);
    assert.equal(_getChallenge('cap-0'), null);
    assert.ok(_getChallenge('cap-500'));
  });
});

describe('retry budget', () => {
  test('SDK maxRetries is 0 (one SDK call equals one Meta call)', () => {
    const Module = require('module');
    const origLoad = Module._load;
    let captured = null;
    function FakeOpenAI(opts) {
      captured = opts;
    }
    Module._load = function (request, ...rest) {
      if (request === 'openai') return FakeOpenAI;
      return origLoad.call(this, request, ...rest);
    };
    try {
      createMetaClient();
    } finally {
      Module._load = origLoad;
    }
    assert.ok(captured, 'expected the openai SDK constructor to run');
    assert.equal(captured.maxRetries, 0);
  });

  test('route keeps 2 attempts inside a ~20s total budget', () => {
    assert.equal(MAX_AI_ATTEMPTS, 2);
    assert.ok(CHALLENGE_TOTAL_TIMEOUT_MS <= 20000);
  });
});

describe('community seed loader', () => {
  function makeSeedSql(existing) {
    const calls = [];
    const inserts = [];
    const fake = (strings, ...values) => {
      const text = strings.join(' ').trim();
      calls.push(text);
      if (text.startsWith('SELECT')) return Promise.resolve(existing);
      if (text.startsWith('INSERT')) {
        inserts.push(values);
        return Promise.resolve([]);
      }
      throw new Error(`unexpected query: ${text.slice(0, 60)}`);
    };
    fake.calls = calls;
    fake.inserts = inserts;
    return fake;
  }

  test('seed data holds 8 player Qbits covering every boost family', () => {
    assert.equal(seedQbits.length, 8);
    for (const qbit of seedQbits) {
      assert.ok(qbit.name && qbit.role && qbit.mission_id && qbit.boost);
      assert.ok(qbit.look && Array.isArray(qbit.parts) && Array.isArray(qbit.fixes));
      assert.ok(qbit.emblem && qbit.recipe && typeof qbit.mechanism === 'string');
    }
    assert.deepEqual(new Set(seedQbits.map((q) => q.boost)), new Set(['PH~', 'N0', 'EN≡', 'G0']));
    // True shape of the pre-existing seed: one exact name+mission duplicate
    // and two missions shared by two different creations each, so only five
    // distinct missions fit under one owner.
    const pairs = seedQbits.map((qbit) => `${qbit.name}|${qbit.mission_id}`);
    assert.equal(new Set(pairs).size, 7);
    assert.equal(new Set(seedQbits.map((qbit) => qbit.mission_id)).size, 5);
  });

  function fullRow(qbit) {
    return {
      name: qbit.name,
      mission_id: qbit.mission_id,
      boost: qbit.boost,
      parts: qbit.parts,
      fixes: qbit.fixes,
    };
  }

  test('each seed Qbit gets its own anonymous owner; exact duplicates skip', async () => {
    assert.equal(SEED_OWNER_PREFIX, '00000000-0000-4000-8000-c0de000000');
    assert.equal(communityOwnerFor(0), '00000000-0000-4000-8000-c0de00000001');
    assert.equal(communityOwnerFor(7), '00000000-0000-4000-8000-c0de00000008');
    const sql = makeSeedSql([]);
    const first = await loadCommunityQbits(sql, seedQbits);
    assert.deepEqual(first, { inserted: 7, skipped: 1, total: 8 });
    const inserts = sql.calls.filter((text) => text.startsWith('INSERT'));
    assert.equal(inserts.length, 7);
    for (const text of inserts) {
      assert.ok(text.includes("'public'"));
      for (const column of ['recipe', 'mechanism']) assert.ok(text.includes(column));
    }
    // Owners follow seed order; slot 06 stays empty (exact duplicate skipped).
    const owners = sql.inserts.map((values) => values[0]);
    assert.deepEqual(owners, [0, 1, 2, 3, 4, 6, 7].map(communityOwnerFor));

    const stored = seedQbits.filter((_, i) => i !== 5).map(fullRow);
    const sql2 = makeSeedSql(stored);
    const second = await loadCommunityQbits(sql2, seedQbits);
    assert.deepEqual(second, { inserted: 0, skipped: 8, total: 8 });
    assert.equal(sql2.calls.filter((text) => text.startsWith('INSERT')).length, 0);
  });

  test('same name with a new mission_id still inserts', async () => {
    const existing = [{ name: seedQbits[0].name, mission_id: 'another-mission' }];
    const sql = makeSeedSql(existing);
    const result = await loadCommunityQbits(sql, [seedQbits[0]]);
    assert.deepEqual(result, { inserted: 1, skipped: 0, total: 1 });
  });

  test('exact duplicate (same name, mission, boost, parts, fixes) is skipped', async () => {
    const sql = makeSeedSql([fullRow(seedQbits[1])]);
    const result = await loadCommunityQbits(sql, [seedQbits[5]]);
    assert.deepEqual(result, { inserted: 0, skipped: 1, total: 1 });
    assert.equal(sql.calls.filter((text) => text.startsWith('INSERT')).length, 0);
  });

  test('same mission with different parts still inserts under its own owner', async () => {
    const twinBraid = seedQbits.find((qbit) => qbit.name === 'TwinBraid');
    const sql = makeSeedSql([fullRow(seedQbits[0])]);
    const result = await loadCommunityQbits(sql, [twinBraid]);
    assert.deepEqual(result, { inserted: 1, skipped: 0, total: 1 });
    assert.equal(sql.inserts[0][0], communityOwnerFor(0));
  });
});
