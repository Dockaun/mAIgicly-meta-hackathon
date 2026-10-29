'use strict';
// Tests for server/continuum-meta.js and server/continuum-routes.js
// (node:test + node:assert only). All model clients are fakes; no network.
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { generateChallenge } = require('../server/continuum-meta');
const { registerContinuumRoutes } = require('../server/continuum-routes');

const CANDIDATES = [
  { id: 'a', name: 'Anchor', owner: 'own', capabilities: ['phase-lock'] },
  { id: 'b', name: 'Ground', owner: 'community', capabilities: ['ground'] },
];

const VALID_MODEL_JSON = JSON.stringify({
  title: 'Steady the Spire',
  brief: 'Hold the spire still while the link bridge reconnects.',
  roles: [
    { id: 'r1', name: 'Phase Anchor', req: ['phase-lock'] },
    { id: 'r2', name: 'Stabilizer', req: ['ground'] },
  ],
});

function fakeClientFor(content) {
  return {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content } }] }),
      },
    },
  };
}

describe('generateChallenge', () => {
  test('returns parsed title/brief/roles from model JSON', async () => {
    const challenge = await generateChallenge(CANDIDATES, {
      client: fakeClientFor(VALID_MODEL_JSON),
    });
    assert.equal(challenge.title, 'Steady the Spire');
    assert.equal(challenge.brief, 'Hold the spire still while the link bridge reconnects.');
    assert.equal(challenge.roles.length, 2);
  });
  test('throws on garbage/non-JSON model output', async () => {
    await assert.rejects(
      generateChallenge(CANDIDATES, { client: fakeClientFor('not json {{{') }),
      /invalid_model_json/
    );
    await assert.rejects(
      generateChallenge(CANDIDATES, { client: fakeClientFor('   ') }),
      /empty_model_response/
    );
  });
  test('throws on client timeout', async () => {
    const hanging = { chat: { completions: { create: () => new Promise(() => {}) } } };
    await assert.rejects(
      generateChallenge(CANDIDATES, { client: hanging, timeoutMs: 50 }),
      /meta_client_timeout/
    );
  });
  test('never exposes MODEL_API_KEY in result or logs', async () => {
    process.env.MODEL_API_KEY = 'sk-test-secret-key';
    const lines = [];
    const origLog = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    try {
      const challenge = await generateChallenge(CANDIDATES, {
        client: fakeClientFor(VALID_MODEL_JSON),
      });
      assert.ok(!JSON.stringify(challenge).includes('sk-test-secret-key'));
      assert.ok(!lines.join('\n').includes('sk-test-secret-key'));
    } finally {
      console.log = origLog;
      delete process.env.MODEL_API_KEY;
    }
  });
});

describe('POST /api/continuum/challenges/next', () => {
  const ARCHITECT = 'architect-secret-123';
  // No sockets: capture the registered handler via a stub app and invoke it
  // directly, so these tests pass regardless of proxy/firewall environment.

  function makeFakeSql(ownRows, publicRows) {
    const calls = [];
    const fake = (strings, ...values) => {
      const text = strings.join(' ');
      calls.push(text);
      if (text.includes('visibility')) return Promise.resolve(publicRows);
      return Promise.resolve(ownRows);
    };
    fake.calls = calls;
    return fake;
  }

  function ownRows() {
    return [
      { id: 'own-1', name: 'Tuner', boost: 'PH~', architect_id: ARCHITECT, alias: 'x', story: 'y', image: 'z' },
    ];
  }
  function publicRows() {
    return [
      { id: 'pub-1', name: 'Magnet', boost: 'N0', architect_id: 'someone-else', alias: 'x', story: 'y', image: 'z' },
    ];
  }

  function makeHandler({ sql, client } = {}) {
    const routes = {};
    const stubApp = { post: (path, fn) => { routes[path] = fn; } };
    registerContinuumRoutes(
      stubApp,
      () => sql || makeFakeSql(ownRows(), publicRows()),
      client ? { client } : {}
    );
    return routes['/api/continuum/challenges/next'];
  }

  async function postNext(handler, body) {
    const req = { body: body === undefined ? { architect_id: ARCHITECT } : body };
    return new Promise((resolve, reject) => {
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { resolve({ status: this.statusCode, json: payload }); },
      };
      Promise.resolve(handler(req, res)).catch(reject);
    });
  }

  function postNextDefault(opts, body) {
    return postNext(makeHandler(opts), body);
  }

  beforeEach(() => {
    delete process.env.CONTINUUM_AI_ENABLED;
    delete process.env.MODEL_API_KEY;
  });

  afterEach(() => {
    delete process.env.CONTINUUM_AI_ENABLED;
    delete process.env.MODEL_API_KEY;
  });

  test('returns 400 without architect_id', async () => {
    const { status } = await postNextDefault(undefined, {});
    assert.equal(status, 400);
  });

  test('offline fallback when AI disabled', async () => {
    const { status, json } = await postNextDefault();
    assert.equal(status, 200);
    assert.equal(json.source, 'offline');
    assert.match(json.id, /^[0-9a-f-]{36}$/);
    assert.ok(typeof json.title === 'string' && json.title.length > 0);
    assert.ok(typeof json.brief === 'string' && json.brief.length > 0);
    assert.equal(json.roles.length, 2);
    assert.deepEqual(json.candidateIds.sort(), ['own-1', 'pub-1'].sort());
  });

  test('offline fallback when AI enabled but key missing', async () => {
    process.env.CONTINUUM_AI_ENABLED = '1';
    const { json } = await postNextDefault();
    assert.equal(json.source, 'offline');
  });

  test('meta source for valid solvable model output', async () => {
    process.env.CONTINUUM_AI_ENABLED = '1';
    process.env.MODEL_API_KEY = 'test-key';
    const { json } = await postNextDefault({ client: fakeClientFor(VALID_MODEL_JSON) });
    assert.equal(json.source, 'meta');
    assert.equal(json.title, 'Steady the Spire');
    assert.equal(json.roles.length, 2);
    assert.deepEqual(Object.keys(json).sort(), ['analysis', 'brief', 'candidateIds', 'difficulty', 'id', 'mode', 'roles', 'source', 'title', 'verified']);
  });

  test('meta challenge reports verified true', async () => {
    process.env.CONTINUUM_AI_ENABLED = '1';
    process.env.MODEL_API_KEY = 'test-key';
    const { json } = await postNextDefault({ client: fakeClientFor(VALID_MODEL_JSON) });
    assert.equal(json.source, 'meta');
    assert.equal(json.verified, true);
  });

  test('offline challenge reports verified true when the pool solves the template', async () => {
    // PH~ + N0 solve Harmonic Rift; EN≡ + PH~ solve Entanglement Cascade,
    // so every random template pick verifies.
    const sql = makeFakeSql(
      [{ id: 'o1', name: 'Tuner', boost: 'PH~' }],
      [
        { id: 'p1', name: 'Magnet', boost: 'N0' },
        { id: 'p2', name: 'Prism', boost: 'EN≡' },
      ]
    );
    const handler = makeHandler({ sql });
    for (let i = 0; i < 5; i++) {
      const { json } = await postNext(handler);
      assert.equal(json.source, 'offline');
      assert.equal(json.verified, true);
    }
  });

  test('offline challenge reports verified false when the pool cannot solve', async () => {
    // Tunnel-only pool solves neither offline template.
    const sql = makeFakeSql(
      [{ id: 'o1', name: 'Veil', boost: 'G0' }],
      [{ id: 'p1', name: 'Shroud', boost: 'G0' }]
    );
    const handler = makeHandler({ sql });
    for (let i = 0; i < 5; i++) {
      const { json } = await postNext(handler);
      assert.equal(json.source, 'offline');
      assert.equal(json.verified, false);
    }
  });

  test('garbage model output falls back to offline', async () => {
    process.env.CONTINUUM_AI_ENABLED = '1';
    process.env.MODEL_API_KEY = 'test-key';
    const { json } = await postNextDefault({ client: fakeClientFor('%%% garbage {{{') });
    assert.equal(json.source, 'offline');
    assert.equal(json.roles.length, 2);
  });

  test('client timeout falls back to offline', async () => {
    process.env.CONTINUUM_AI_ENABLED = '1';
    process.env.MODEL_API_KEY = 'test-key';
    const timeoutErr = new Error('timeout of 15000ms exceeded');
    timeoutErr.code = 'ETIMEDOUT';
    const failing = { chat: { completions: { create: async () => { throw timeoutErr; } } } };
    const { json } = await postNextDefault({ client: failing });
    assert.equal(json.source, 'offline');
  });

  test('invalid model challenge retried then falls back to offline', async () => {
    process.env.CONTINUUM_AI_ENABLED = '1';
    process.env.MODEL_API_KEY = 'test-key';
    let calls = 0;
    const unsolvable = {
      chat: {
        completions: {
          create: async () => {
            calls++;
            return { choices: [{ message: { content: JSON.stringify({
              title: 'Impossible',
              brief: 'Nobody can do this.',
              roles: [
                { id: 'r1', name: 'Ghost', req: ['tunnel'] },
                { id: 'r2', name: 'Shade', req: ['tunnel'] },
              ],
            }) } }] };
          },
        },
      },
    };
    const { json } = await postNextDefault({ client: unsolvable });
    assert.equal(json.source, 'offline');
    assert.equal(calls, 2);
  });

  test('route never returns architect_id or private fields', async () => {
    const { json } = await postNextDefault();
    const raw = JSON.stringify(json);
    assert.ok(!raw.includes('architect_id'));
    assert.ok(!raw.includes(ARCHITECT));
    assert.ok(!raw.includes('alias'));
    assert.ok(!raw.includes('secret'));
  });

  test('offline template content matches continuum.html missionTemplates', async () => {
    const handler = makeHandler();
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
      const { json } = await postNext(handler);
      seen.add(`${json.title} | ${json.brief} | ${JSON.stringify(json.roles)}`);
    }
    const allowed = new Set([
      'Harmonic Rift | Resonance fracture detected. Needs a Qbit that can keep quantum states synchronized until energy is released on cue, and one that can drain noise into a quiet ground. | [{"id":1,"name":"Phase Anchor","req":["phase-lock"],"needs":"Needs a Qbit that can keep quantum states synchronized until energy is released on cue"},{"id":2,"name":"Stabilizer","req":["ground"],"needs":"Needs a Qbit that can drain noise into a quiet ground"}]',
      'Entanglement Cascade | Nodes desyncing. Needs a Qbit that can link distant quantum states so their outcomes are correlated, and one that can keep quantum states synchronized until energy is released on cue. | [{"id":1,"name":"Link Bridge","req":["entangle"],"needs":"Needs a Qbit that can link distant quantum states so their outcomes are correlated"},{"id":2,"name":"Timing Sync","req":["phase-lock"],"needs":"Needs a Qbit that can keep quantum states synchronized until energy is released on cue"}]',
    ]);
    for (const s of seen) assert.ok(allowed.has(s), `unexpected offline template: ${s}`);
  });

  test('bounded sample queries (LIMIT, no full-table scan)', async () => {
    const sql = makeFakeSql(ownRows(), publicRows());
    await postNextDefault({ sql });
    assert.ok(sql.calls.length >= 2);
    for (const q of sql.calls) assert.match(q, /LIMIT/);
    assert.ok(sql.calls.every((q) => !q.includes('SELECT *')));
  });
});
