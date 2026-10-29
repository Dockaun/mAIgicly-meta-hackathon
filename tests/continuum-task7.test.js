'use strict';
// Hackathon step 7: recipe-based capabilities, adaptive levels, Invent mode,
// Continuum Qbits (node:test + node:assert only). Model clients are fakes;
// database tests use in-memory PGlite (a shipped dependency), no network.
const { test, describe, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rules = require('../server/continuum-rules');
const shared = require('../public/js/continuum-capabilities');
const { generateChallenge } = require('../server/continuum-meta');
const {
  registerContinuumRoutes,
  OFFLINE_LEVEL_STORIES,
  _clearChallenges,
} = require('../server/continuum-routes');
const { migrateContinuumQbits, PARTIAL_INDEX_NAME } = require('../server/continuum-migrate');
const { writeQbit } = require('../server/forged-qbits-write');
const { loadCommunityQbits } = require('../db/seed/load-community-qbits');
const seedQbits = require('../db/seed/community-qbits.json');

const ARCHITECT = 'architect-task7-1';

// ---------------------------------------------------------------------------
// 1. Fix-tag mapping and client/server parity (one shared mapping)
// ---------------------------------------------------------------------------

describe('fix-tag capabilities', () => {
  test('exact fix mapping: SH/F::/C// add superposition/phase-control/collapse', () => {
    assert.deepEqual(shared.FIX_TAG_MAP, { SH: 'superposition', 'F::': 'phase-control', 'C//': 'collapse' });
    assert.deepEqual(rules.deriveCapabilities({ boost: 'PH~', fixes: ['SH'] }),
      ['phase-lock', 'superposition']);
    assert.deepEqual(rules.deriveCapabilities({ boost: 'N0', fixes: ['F::', 'C//'] }),
      ['ground', 'phase-control', 'collapse']);
    assert.deepEqual(rules.deriveCapabilities({ boost: 'EN≡', fixes: ['SH', 'F::', 'C//'] }),
      ['entangle', 'superposition', 'phase-control', 'collapse']);
  });

  test('boost tags unchanged; unknown fixes ignored; duplicates removed', () => {
    assert.deepEqual(rules.deriveCapabilities({ boost: 'G0', fixes: [] }), ['tunnel']);
    assert.deepEqual(rules.deriveCapabilities({ boost: 'G0' }), ['tunnel']);
    assert.deepEqual(rules.deriveCapabilities({ boost: 'XX', fixes: ['SH'] }), ['hybrid', 'superposition']);
    assert.deepEqual(rules.deriveCapabilities({ boost: 'N0', fixes: ['bogus', 'SH', 'SH'] }),
      ['ground', 'superposition']);
    assert.deepEqual(rules.deriveCapabilities({ boost: 'N0', fixes: 'not-json' }),
      ['ground']);
  });

  test('fixes accepted as a JSON string (JSONB selected as text)', () => {
    assert.deepEqual(rules.deriveCapabilities({ boost: 'PH~', fixes: JSON.stringify(['C//']) }),
      ['phase-lock', 'collapse']);
  });

  test('server rules re-export the one shared mapping (parity by construction)', () => {
    assert.equal(rules.CAPABILITY_VOCAB, shared.CAPABILITY_VOCAB);
    assert.equal(rules.deriveCapabilities, shared.deriveCapabilities);
    assert.equal(rules.roleSatisfiedBy, shared.roleSatisfiedBy);
    assert.deepEqual(rules.FIX_TAG_MAP, shared.FIX_TAG_MAP);
    assert.deepEqual(rules.BOOST_TAG_MAP, shared.BOOST_TAG_MAP);
  });

  test('parity across every boost x fix combination incl. string form', () => {
    const boosts = ['PH~', 'N0', 'EN≡', 'G0', 'XX', '', undefined];
    const fixSets = [[], ['SH'], ['F::'], ['C//'], ['SH', 'F::'], ['C//', 'SH']];
    for (const boost of boosts) {
      for (const fixes of fixSets) {
        for (const form of [fixes, JSON.stringify(fixes)]) {
          assert.deepEqual(
            rules.deriveCapabilities({ boost, fixes: form }),
            shared.deriveCapabilities({ boost, fixes: form }),
            `boost=${boost} fixes=${JSON.stringify(form)}`
          );
        }
      }
    }
  });

  test('continuum.html loads the shared script and uses it (parity in the client)', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'continuum.html'), 'utf8');
    assert.ok(page.includes('<script src="/js/continuum-capabilities.js"></script>'));
    const enrich = page.slice(page.indexOf('function enrichQbitData'), page.indexOf('function extractCapabilities'));
    assert.ok(enrich.includes('window.ContinuumCapabilities'));
    assert.ok(enrich.includes('deriveCapabilities(qbit)'));
    assert.ok(page.includes('window.ContinuumCapabilities.roleSatisfiedBy('));
    // Cards and slot labels show every tag, not just the profile specialty.
    assert.ok(page.includes("(q.capabilityTags || []).join(' · ')"));
    assert.ok(page.includes('function roleNeedsText(role)'));
  });
});

// ---------------------------------------------------------------------------
// 2. Role semantics: req ANY-of vs reqAll ALL-of, two distinct Qbits
// ---------------------------------------------------------------------------

describe('reqAll role semantics', () => {
  const comboRoles = [
    { id: 'r1', name: 'Dual Anchor', reqAll: ['phase-lock', 'collapse'] },
    { id: 'r2', name: 'Stabilizer', req: ['ground'] },
  ];

  test('checkSolution enforces ALL-of for reqAll', () => {
    const both = { id: 'a', capabilities: ['phase-lock', 'collapse'] };
    const stab = { id: 'b', capabilities: ['ground'] };
    assert.equal(rules.checkSolution(comboRoles, [both, stab]), true);
    const partial = { id: 'a', capabilities: ['phase-lock'] };
    assert.equal(rules.checkSolution(comboRoles, [partial, stab]), false);
  });

  test('checkSolution still rejects the same Qbit twice (reqAll included)', () => {
    const both = { id: 'a', capabilities: ['phase-lock', 'collapse', 'ground'] };
    assert.equal(rules.checkSolution(comboRoles, [both, both]), false);
    assert.equal(rules.checkSolution(comboRoles, [{ ...both }, { ...both }]), false);
  });

  test('validateChallenge accepts solvable reqAll, rejects unsolvable reqAll', () => {
    const challenge = {
      title: 'Dual Test',
      brief: 'Cover the combined signature.',
      roles: comboRoles,
    };
    const solvable = [
      { id: 'a', capabilities: ['phase-lock', 'collapse'] },
      { id: 'b', capabilities: ['ground'] },
    ];
    assert.deepEqual(rules.validateChallenge(challenge, solvable), { ok: true });
    const unsolvable = [
      { id: 'a', capabilities: ['phase-lock'] },
      { id: 'b', capabilities: ['ground'] },
    ];
    const verdict = rules.validateChallenge(challenge, unsolvable);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason, /distinct/);
  });

  test('validateChallenge requires exactly one of req / reqAll', () => {
    const base = [
      { id: 'a', capabilities: ['phase-lock', 'collapse'] },
      { id: 'b', capabilities: ['ground'] },
    ];
    const bothKeys = {
      title: 'T', brief: 'B',
      roles: [
        { id: 'r1', name: 'R', req: ['phase-lock'], reqAll: ['phase-lock'] },
        { id: 'r2', name: 'S', req: ['ground'] },
      ],
    };
    assert.match(rules.validateChallenge(bothKeys, base).reason, /exactly one of req or reqAll/);
    const neither = {
      title: 'T', brief: 'B',
      roles: [
        { id: 'r1', name: 'R' },
        { id: 'r2', name: 'S', req: ['ground'] },
      ],
    };
    assert.match(rules.validateChallenge(neither, base).reason, /exactly one of req or reqAll/);
    const emptyAll = {
      title: 'T', brief: 'B',
      roles: [
        { id: 'r1', name: 'R', reqAll: [] },
        { id: 'r2', name: 'S', req: ['ground'] },
      ],
    };
    assert.equal(rules.validateChallenge(emptyAll, base).ok, false);
    const badTag = {
      title: 'T', brief: 'B',
      roles: [
        { id: 'r1', name: 'R', reqAll: ['phase-lock', 'teleport'] },
        { id: 'r2', name: 'S', req: ['ground'] },
      ],
    };
    assert.match(rules.validateChallenge(badTag, base).reason, /unknown capability tag/);
  });

  test('two distinct Qbits still required when one Qbit could fill both roles', () => {
    const challenge = {
      title: 'T', brief: 'B',
      roles: [
        { id: 'r1', name: 'R', req: ['phase-lock'] },
        { id: 'r2', name: 'S', reqAll: ['phase-lock', 'collapse'] },
      ],
    };
    const candidates = [
      { id: 'only', capabilities: ['phase-lock', 'collapse'] },
      { id: 'other', capabilities: ['entangle'] },
    ];
    assert.equal(rules.validateChallenge(challenge, candidates).ok, false);
  });
});

// ---------------------------------------------------------------------------
// 3. Adaptive levels from the last 5 results
// ---------------------------------------------------------------------------

describe('levelForResults', () => {
  const W = { passed: true };
  const F = { passed: false };

  test('start at 1 with no history', () => {
    assert.equal(rules.levelForResults([]), 1);
    assert.equal(rules.levelForResults(null), 1);
    assert.equal(rules.levelForResults(undefined), 1);
  });

  test('3+ wins lift one level', () => {
    assert.equal(rules.levelForResults([W, W, W]), 2);
    assert.equal(rules.levelForResults([W, W, W, W]), 2);
    assert.equal(rules.levelForResults([W, W]), 1);
  });

  test('a dominant 5-0 window reaches level 3', () => {
    assert.equal(rules.levelForResults([W, W, W, W, W]), 3);
    assert.equal(rules.levelForResults([W, W, W, W, F]), 2);
  });

  test('2+ fails drop one level, floored at 1', () => {
    assert.equal(rules.levelForResults([W, W, W, F, F]), 1);
    assert.equal(rules.levelForResults([F, F]), 1);
    assert.equal(rules.levelForResults([F, F, F, F, F]), 1);
    assert.equal(rules.levelForResults([W, F]), 1);
  });

  test('only the last 5 count; non-result rows are ignored', () => {
    assert.equal(rules.levelForResults([F, F, F, F, F, W, W, W, W, W]), 3);
    assert.equal(rules.levelForResults([W, W, W, W, W, F, F, F, F, F]), 1);
    assert.equal(rules.levelForResults([{ id: 1 }, { boost: 'PH~' }]), 1);
  });
});

// ---------------------------------------------------------------------------
// 4. Level plans: L2 solvable reqAll, L3 unsolvable-from-pool but forgeable
// ---------------------------------------------------------------------------

function communityCandidates() {
  // The real pre-existing seed through the real capability derivation.
  return seedQbits.map((qbit, index) => ({
    id: `seed-${index}`,
    name: qbit.name,
    capabilities: rules.deriveCapabilities(qbit),
  }));
}

describe('level plans', () => {
  test('isForgeableCombo accepts one boost tag-set + 1-2 fix tags only', () => {
    assert.equal(rules.isForgeableCombo(['phase-lock', 'superposition']), true);
    assert.equal(rules.isForgeableCombo(['entangle', 'collapse', 'superposition']), true);
    assert.equal(rules.isForgeableCombo(['tunnel', 'phase-control']), true);
    assert.equal(rules.isForgeableCombo(['phase-lock', 'ground', 'superposition']), false); // mixed boost sets
    assert.equal(rules.isForgeableCombo(['phase-lock']), false); // no fix tag
    assert.equal(rules.isForgeableCombo(['entangle']), false);
    assert.equal(rules.isForgeableCombo(['phase-lock', 'superposition', 'phase-control', 'collapse']), false); // 3 fixes
    assert.equal(rules.isForgeableCombo(['phase-lock', 'phase-lock', 'superposition']), false); // duplicate
    assert.equal(rules.isForgeableCombo(['phase-lock', 'teleport']), false);
  });

  test('buildAvailablePlan returns a solver-proven reqAll + req pair', () => {
    const plan = rules.buildAvailablePlan(communityCandidates());
    assert.ok(plan, 'expected an L2 plan from the community pool');
    assert.equal(plan.difficulty, 2);
    assert.equal(plan.mode, 'available');
    assert.equal(plan.roles.length, 2);
    assert.ok(Array.isArray(plan.roles[0].reqAll) && plan.roles[0].reqAll.length === 2);
    const boostTags = ['phase-lock', 'ground', 'entangle', 'tunnel', 'hybrid'];
    const fixTags = ['superposition', 'phase-control', 'collapse'];
    assert.ok(boostTags.includes(plan.roles[0].reqAll[0]));
    assert.ok(fixTags.includes(plan.roles[0].reqAll[1]));
    assert.deepEqual(
      rules.validateChallenge(
        { title: 'L2 probe', brief: 'Solver proof.', roles: plan.roles },
        communityCandidates()
      ),
      { ok: true }
    );
  });

  test('buildAvailablePlan returns null when no candidate pairs boost+fix', () => {
    const pool = [
      { id: 'a', capabilities: ['phase-lock'] },
      { id: 'b', capabilities: ['ground'] },
    ];
    assert.equal(rules.buildAvailablePlan(pool), null);
    assert.equal(rules.buildAvailablePlan([]), null);
  });

  test('buildInventPlan: unsolvable-from-pool but forgeable, anchor solvable', () => {
    const pool = communityCandidates();
    const plan = rules.buildInventPlan(pool);
    assert.ok(plan, 'expected an L3 plan from the community pool');
    assert.equal(plan.difficulty, 3);
    assert.equal(plan.mode, 'invent');
    const [invent, anchor] = plan.roles;
    assert.ok(Array.isArray(invent.reqAll));
    assert.equal(rules.isForgeableCombo(invent.reqAll), true);
    for (const candidate of pool) {
      assert.equal(rules.roleSatisfiedBy(invent, candidate.capabilities), false,
        `pool candidate ${candidate.id} already holds the Invent combo`);
    }
    assert.ok(pool.some((c) => rules.roleSatisfiedBy(anchor, c.capabilities)));
    // The solver proves both halves.
    assert.deepEqual(
      rules.validateInventChallenge(
        { title: 'L3 probe', brief: 'Solver proof.', roles: plan.roles },
        pool
      ),
      { ok: true }
    );
  });

  test('validateInventChallenge rejects solvable invent roles and dead anchors', () => {
    const pool = communityCandidates();
    const plan = rules.buildInventPlan(pool);
    const held = {
      title: 'T', brief: 'B',
      roles: [
        { id: 'r1', name: 'I', reqAll: ['ground', 'superposition'] },
        plan.roles[1],
      ],
    };
    assert.match(rules.validateInventChallenge(held, pool).reason, /already solvable/);
    const deadAnchor = {
      title: 'T', brief: 'B',
      roles: [plan.roles[0], { id: 'r2', name: 'A', req: ['teleport'] }],
    };
    assert.equal(rules.validateInventChallenge(deadAnchor, pool).ok, false);
    const twoInvent = {
      title: 'T', brief: 'B',
      roles: [plan.roles[0], { id: 'r2', name: 'A', reqAll: [...plan.roles[0].reqAll] }],
    };
    // Both roles forgeable combos of the same shape: exactly-one-invent fails
    // only when both are forgeable, which they are here by construction.
    assert.match(rules.validateInventChallenge(twoInvent, pool).reason, /exactly one forgeable/);
  });

  test('rolesMatchRequired compares key + tag set in either orientation', () => {
    const required = [
      { reqAll: ['phase-lock', 'superposition'] },
      { req: ['ground'] },
    ];
    assert.equal(rules.rolesMatchRequired(
      [{ req: ['ground'] }, { reqAll: ['superposition', 'phase-lock'] }],
      required
    ), true);
    assert.equal(rules.rolesMatchRequired(
      [{ reqAll: ['phase-lock'] }, { req: ['ground'] }],
      required
    ), false);
    assert.equal(rules.rolesMatchRequired(
      [{ req: ['phase-lock', 'superposition'] }, { req: ['ground'] }],
      required
    ), false); // req instead of reqAll
  });
});

// ---------------------------------------------------------------------------
// 5. Routes: server-decided levels, difficulty/mode, results recording
// ---------------------------------------------------------------------------

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

// Fake sql routing sample loads, result history, by-id loads, and result
// writes. Captures continuum_results inserts for the write tests.
function makeTask7Sql({ own = [], pub = [], results = [], byId = {}, failResultsWrite = false } = {}) {
  const inserts = [];
  const fake = (strings, ...values) => {
    const text = strings.join(' ');
    if (text.includes('continuum_results') && text.includes('INSERT')) {
      inserts.push(values);
      if (failResultsWrite) return Promise.reject(new Error('results table missing'));
      return Promise.resolve([]);
    }
    if (text.includes('continuum_results')) return Promise.resolve(results);
    if (text.includes('WHERE id =')) {
      const row = byId[values[0]];
      return Promise.resolve(row ? [row] : []);
    }
    if (text.includes('visibility')) return Promise.resolve(pub);
    return Promise.resolve(own);
  };
  fake.inserts = inserts;
  return fake;
}

function makeTask7Routes(sql, client) {
  const routes = {};
  const stubApp = { post: (p, fn) => { routes[p] = fn; } };
  registerContinuumRoutes(stubApp, () => sql, client ? { client } : {});
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

function richPool() {
  // Pool with fixes so L2/L3 plans are buildable.
  return {
    own: [
      { id: 'own-1', name: 'Tuner', boost: 'PH~', fixes: ['F::', 'C//'], architect_id: ARCHITECT },
      { id: 'own-2', name: 'Magnet', boost: 'N0', fixes: ['SH'], architect_id: ARCHITECT },
    ],
    pub: [
      { id: 'pub-1', name: 'Prism', boost: 'EN≡', fixes: ['SH'], architect_id: 'other' },
      { id: 'pub-2', name: 'Veil', boost: 'G0', fixes: ['F::'], architect_id: 'other' },
    ],
  };
}

describe('challenge route levels', () => {
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

  test('fresh architect gets difficulty 1, mode available (offline)', async () => {
    const pool = richPool();
    const sql = makeTask7Sql({ ...pool, results: [] });
    const routes = makeTask7Routes(sql);
    const { json } = await post(routes['/api/continuum/challenges/next'], { architect_id: ARCHITECT });
    assert.equal(json.difficulty, 1);
    assert.equal(json.mode, 'available');
    assert.equal(json.source, 'offline');
  });

  test('client cannot set the level: body difficulty/level/mode are ignored', async () => {
    const pool = richPool();
    const sql = makeTask7Sql({ ...pool, results: [] });
    const routes = makeTask7Routes(sql);
    const { json } = await post(routes['/api/continuum/challenges/next'], {
      architect_id: ARCHITECT,
      difficulty: 3,
      level: 3,
      mode: 'invent',
    });
    assert.equal(json.difficulty, 1);
    assert.equal(json.mode, 'available');
    assert.ok(!JSON.stringify(json).includes('invent'));
  });

  test('3-win history serves difficulty 2 with a proven reqAll role (offline)', async () => {
    const pool = richPool();
    const sql = makeTask7Sql({ ...pool, results: [{ passed: true }, { passed: true }, { passed: true }] });
    const routes = makeTask7Routes(sql);
    const { json } = await post(routes['/api/continuum/challenges/next'], { architect_id: ARCHITECT });
    assert.equal(json.source, 'offline');
    assert.equal(json.difficulty, 2);
    assert.equal(json.mode, 'available');
    assert.equal(json.title, OFFLINE_LEVEL_STORIES[2].title);
    const reqAllRoles = json.roles.filter((r) => Array.isArray(r.reqAll));
    assert.equal(reqAllRoles.length, 1);
    assert.equal(reqAllRoles[0].reqAll.length, 2);
    assert.equal(json.verified, true);
  });

  test('5-0 history serves difficulty 3 invent with an unheld forgeable combo (offline)', async () => {
    const pool = richPool();
    const results = [{ passed: true }, { passed: true }, { passed: true }, { passed: true }, { passed: true }];
    const sql = makeTask7Sql({ ...pool, results });
    const routes = makeTask7Routes(sql);
    const { json } = await post(routes['/api/continuum/challenges/next'], { architect_id: ARCHITECT });
    assert.equal(json.source, 'offline');
    assert.equal(json.difficulty, 3);
    assert.equal(json.mode, 'invent');
    assert.equal(json.title, OFFLINE_LEVEL_STORIES[3].title);
    const inventRole = json.roles.find((r) => Array.isArray(r.reqAll));
    assert.ok(inventRole, 'expected one reqAll invent role');
    assert.equal(rules.isForgeableCombo(inventRole.reqAll), true);
    const poolCaps = [...pool.own, ...pool.pub].map((row) => rules.deriveCapabilities(row));
    for (const caps of poolCaps) {
      assert.equal(rules.roleSatisfiedBy(inventRole, caps), false);
    }
    assert.equal(json.verified, true);
  });

  test('2-fail history drops back to difficulty 1', async () => {
    const pool = richPool();
    const results = [{ passed: true }, { passed: true }, { passed: true }, { passed: false }, { passed: false }];
    const sql = makeTask7Sql({ ...pool, results });
    const routes = makeTask7Routes(sql);
    const { json } = await post(routes['/api/continuum/challenges/next'], { architect_id: ARCHITECT });
    assert.equal(json.difficulty, 1);
    assert.equal(json.mode, 'available');
  });

  test('level downgrades to 1 when the pool cannot support reqAll', async () => {
    const results = [{ passed: true }, { passed: true }, { passed: true }];
    const sql = makeTask7Sql({
      own: [{ id: 'o1', name: 'Bare', boost: 'PH~', architect_id: ARCHITECT }],
      pub: [{ id: 'p1', name: 'Plain', boost: 'N0', architect_id: 'other' }],
      results,
    });
    const routes = makeTask7Routes(sql);
    const { json } = await post(routes['/api/continuum/challenges/next'], { architect_id: ARCHITECT });
    assert.equal(json.difficulty, 1);
    assert.equal(json.mode, 'available');
  });

  test('meta at level 2 must copy the required tags exactly or fall back', async () => {
    process.env.CONTINUUM_AI_ENABLED = '1';
    process.env.MODEL_API_KEY = 'test-key';
    const pool = richPool();
    const results = [{ passed: true }, { passed: true }, { passed: true }];
    const candidates = rules.selectCandidates(pool.own, pool.pub, 12);
    const plan = rules.buildAvailablePlan(candidates);
    assert.ok(plan, 'test pool must support an L2 plan');
    const copied = JSON.stringify({
      title: 'Copied Dual Breach',
      brief: 'The model copied the required tags exactly.',
      roles: [
        { id: 'r1', name: 'Dual Anchor', reqAll: plan.roles[0].reqAll },
        { id: 'r2', name: 'Relay Stabilizer', req: plan.roles[1].req },
      ],
    });
    const sql = makeTask7Sql({ ...pool, results });
    const routes = makeTask7Routes(sql, fakeClientFor(copied));
    const good = await post(routes['/api/continuum/challenges/next'], { architect_id: ARCHITECT });
    assert.equal(good.json.source, 'meta');
    assert.equal(good.json.difficulty, 2);
    assert.equal(good.json.mode, 'available');
    assert.equal(good.json.verified, true);

    const altered = JSON.stringify({
      title: 'Altered Dual Breach',
      brief: 'The model changed a required tag.',
      roles: [
        { id: 'r1', name: 'Dual Anchor', reqAll: ['phase-lock', 'superposition'] },
        { id: 'r2', name: 'Relay Stabilizer', req: plan.roles[1].req },
      ],
    });
    // Only run the altered case when it actually differs from required.
    if (!rules.rolesMatchRequired(JSON.parse(altered).roles, plan.roles)) {
      const client = fakeClientFor(altered);
      const routes2 = makeTask7Routes(makeTask7Sql({ ...pool, results }), client);
      const bad = await post(routes2['/api/continuum/challenges/next'], { architect_id: ARCHITECT });
      assert.equal(bad.json.source, 'offline');
      assert.equal(bad.json.difficulty, 2);
      assert.equal(client.calls.length, 2);
    }
  });

  test('meta at level 1 rejects multi-tag req (single-tag shape)', async () => {
    process.env.CONTINUUM_AI_ENABLED = '1';
    process.env.MODEL_API_KEY = 'test-key';
    const pool = richPool();
    const multi = JSON.stringify({
      title: 'Wide Net Breach',
      brief: 'Two tags on one role.',
      roles: [
        { id: 'r1', name: 'Anchor', req: ['phase-lock', 'ground'] },
        { id: 'r2', name: 'Stabilizer', req: ['ground'] },
      ],
    });
    const client = fakeClientFor(multi);
    const routes = makeTask7Routes(makeTask7Sql({ ...pool, results: [] }), client);
    const { json } = await post(routes['/api/continuum/challenges/next'], { architect_id: ARCHITECT });
    assert.equal(json.source, 'offline');
    assert.equal(json.difficulty, 1);
    assert.equal(client.calls.length, 2);
  });

  test('generateChallenge sends level + required tags; Meta writes the story', async () => {
    const candidates = rules.selectCandidates(richPool().own, richPool().pub, 12);
    const plan = rules.buildAvailablePlan(candidates);
    const content = JSON.stringify({
      title: 'T', brief: 'B',
      roles: [
        { id: 'r1', name: 'A', reqAll: plan.roles[0].reqAll },
        { id: 'r2', name: 'B', req: plan.roles[1].req },
      ],
    });
    const client = fakeClientFor(content);
    await generateChallenge(candidates, { client, level: 2, requiredRoles: plan.roles });
    const userMsg = client.calls[0].messages.find((m) => m.role === 'user').content;
    assert.ok(userMsg.includes('Difficulty level: 2'));
    assert.ok(userMsg.includes('REQUIRED role tags'));
    assert.ok(userMsg.includes(JSON.stringify({ reqAll: plan.roles[0].reqAll }).slice(1, -1)));
  });
});

describe('interpret records results', () => {
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

  function interpretSetup() {
    const byId = {
      'own-1': { id: 'own-1', name: 'Tuner', boost: 'PH~', fixes: [], visibility: 'private', architect_id: ARCHITECT },
      'pub-1': { id: 'pub-1', name: 'Magnet', boost: 'N0', fixes: [], visibility: 'public', architect_id: 'other' },
    };
    const sql = makeTask7Sql({
      own: [byId['own-1']],
      pub: [byId['pub-1']],
      results: [],
      byId,
    });
    return { byId, sql, routes: makeTask7Routes(sql) };
  }

  test('a judged pass writes one results row from the rules-decided result', async () => {
    const { sql, routes } = interpretSetup();
    const challenge = (await post(routes['/api/continuum/challenges/next'], { architect_id: ARCHITECT })).json;
    // Force stored roles to a known passing pair for own-1/pub-1.
    const stored = require('../server/continuum-routes')._challenges.get(challenge.id);
    stored.roles = [
      { id: 'r1', name: 'Anchor', req: ['phase-lock'] },
      { id: 'r2', name: 'Stabilizer', req: ['ground'] },
    ];
    const attempt = await post(routes['/api/continuum/attempts/interpret'], {
      challenge_id: challenge.id,
      architect_id: ARCHITECT,
      assigned_qbit_ids: ['own-1', 'pub-1'],
    });
    assert.equal(attempt.json.passed, true);
    assert.equal(sql.inserts.length, 1);
    assert.deepEqual(sql.inserts[0], [ARCHITECT, challenge.id, true]);
  });

  test('a judged fail writes passed=false', async () => {
    const { sql, routes } = interpretSetup();
    const challenge = (await post(routes['/api/continuum/challenges/next'], { architect_id: ARCHITECT })).json;
    const stored = require('../server/continuum-routes')._challenges.get(challenge.id);
    stored.roles = [
      { id: 'r1', name: 'Anchor', req: ['phase-lock'] },
      { id: 'r2', name: 'Stabilizer', req: ['ground'] },
    ];
    const attempt = await post(routes['/api/continuum/attempts/interpret'], {
      challenge_id: challenge.id,
      architect_id: ARCHITECT,
      assigned_qbit_ids: ['pub-1', 'own-1'],
    });
    assert.equal(attempt.json.passed, false);
    assert.equal(sql.inserts.length, 1);
    assert.deepEqual(sql.inserts[0], [ARCHITECT, challenge.id, false]);
  });

  test('a failed results write never fails the interpretation', async () => {
    const byId = {
      'own-1': { id: 'own-1', name: 'Tuner', boost: 'PH~', fixes: [], visibility: 'private', architect_id: ARCHITECT },
      'pub-1': { id: 'pub-1', name: 'Magnet', boost: 'N0', fixes: [], visibility: 'public', architect_id: 'other' },
    };
    const sql = makeTask7Sql({ own: [byId['own-1']], pub: [byId['pub-1']], results: [], byId, failResultsWrite: true });
    const routes = makeTask7Routes(sql);
    const challenge = (await post(routes['/api/continuum/challenges/next'], { architect_id: ARCHITECT })).json;
    const attempt = await post(routes['/api/continuum/attempts/interpret'], {
      challenge_id: challenge.id,
      architect_id: ARCHITECT,
      assigned_qbit_ids: ['own-1', 'pub-1'],
    });
    assert.equal(attempt.status, 200);
    assert.equal(typeof attempt.json.passed, 'boolean');
  });
});

// ---------------------------------------------------------------------------
// 6. Storage: migration preserves every row and recipe; forged vs continuum
// ---------------------------------------------------------------------------

const { PGlite } = require('@electric-sql/pglite');

function wrapPglite(db) {
  const sql = (strings, ...values) => {
    let text = '';
    const params = [];
    for (let i = 0; i < strings.length; i++) {
      text += strings[i];
      if (i < values.length) {
        params.push(values[i] === undefined ? null : values[i]);
        text += `$${params.length}`;
      }
    }
    return db.query(text, params).then((result) => result.rows || []);
  };
  return sql;
}

// One shared file-backed PGlite for the whole file: a fresh init costs ~10s
// and ~700MB transiently, while reopening an existing data dir costs ~1.5s
// and ~340MB. Tests reset the schema instead of allocating a database each.
const TEST_DATA_DIR = require('node:os').tmpdir() + '/continuum-task7-pglite';
let sharedDb = null;
async function getSharedDb() {
  if (!sharedDb) sharedDb = new PGlite(TEST_DATA_DIR);
  return sharedDb;
}
async function resetDb(statements) {
  const db = await getSharedDb();
  await db.exec('DROP TABLE IF EXISTS forged_qbits; DROP TABLE IF EXISTS continuum_results;');
  for (const stmt of statements) {
    await db.exec(stmt);
  }
  return { db, sql: wrapPglite(db) };
}

const OLD_SHAPE_SQL = `
  CREATE TABLE forged_qbits (
    id SERIAL PRIMARY KEY,
    architect_id TEXT NOT NULL,
    name TEXT NOT NULL,
    alias TEXT,
    role TEXT NOT NULL,
    mission_id TEXT NOT NULL,
    look JSONB NOT NULL DEFAULT '{}',
    parts JSONB NOT NULL DEFAULT '[]',
    fixes JSONB NOT NULL DEFAULT '[]',
    boost TEXT NOT NULL DEFAULT '',
    emblem JSONB NOT NULL DEFAULT '{}',
    story TEXT NOT NULL DEFAULT '',
    mechanism TEXT DEFAULT '',
    recipe JSONB,
    image TEXT,
    timestamp BIGINT NOT NULL,
    visibility TEXT DEFAULT 'public',
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (architect_id, mission_id)
  )
`;

async function freshOldShapeDb() {
  return resetDb([OLD_SHAPE_SQL]);
}

async function freshNewShapeDb() {
  // New shape exactly as db/schema.sql defines it (parsed the same way the
  // local-sql loader parses it), so drift between schema and migration fails.
  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const statements = schema.split(';').map((s) => s.replace(/--[^\n]*/g, '').trim()).filter(Boolean);
  const { db, sql } = await resetDb([]);
  for (const stmt of statements) {
    try {
      await db.exec(stmt);
    } catch (err) {
      if (!String((err && err.message) || '').includes('already exists')) throw err;
    }
  }
  return { db, sql };
}

function sampleFields(overrides = {}) {
  return {
    architect_id: 'arch-1',
    name: 'Sample',
    alias: null,
    role: 'Test role',
    mission_id: 'harmonic_tuning',
    look: {},
    parts: ['phase_prism'],
    fixes: ['SH'],
    boost: 'PH~',
    emblem: {},
    story: '',
    mechanism: '',
    recipe: { mood: 'calm' },
    image: null,
    timestamp: 1700000000000,
    visibility: 'public',
    ...overrides,
  };
}

async function insertRaw(sql, fields) {
  await sql`INSERT INTO forged_qbits (
      architect_id, name, alias, role, mission_id, look, parts, fixes, boost,
      emblem, story, mechanism, recipe, image, timestamp, visibility, view_count, created_at
    ) VALUES (
      ${fields.architect_id}, ${fields.name}, ${fields.alias}, ${fields.role}, ${fields.mission_id},
      ${JSON.stringify(fields.look)}, ${JSON.stringify(fields.parts)},
      ${JSON.stringify(fields.fixes)}, ${fields.boost},
      ${JSON.stringify(fields.emblem)}, ${fields.story}, ${fields.mechanism}, ${JSON.stringify(fields.recipe)},
      ${fields.image}, ${fields.timestamp}, ${fields.visibility}, 0, NOW()
    )`;
}

describe('continuum storage migration', () => {
  test('migration preserves every row and recipe; old constraint replaced by the partial index', async () => {
    const { sql } = await freshOldShapeDb();
      await insertRaw(sql, sampleFields({ name: 'First', mission_id: 'harmonic_tuning', recipe: { mood: 'calm', n: 1 } }));
      await insertRaw(sql, sampleFields({ name: 'Second', mission_id: 'entanglement', fixes: ['F::', 'C//'], boost: 'N0', recipe: { mood: 'lively' } }));
      await insertRaw(sql, sampleFields({ architect_id: 'arch-2', name: 'Third', mission_id: 'harmonic_tuning', recipe: null }));
      const before = await sql`SELECT id, architect_id, name, mission_id, parts, fixes, boost, recipe FROM forged_qbits ORDER BY id`;

      const report = await migrateContinuumQbits(sql);

      assert.equal(report.before.total, 3);
      assert.equal(report.after.total, 3);
      assert.equal(report.after.checksum, report.before.checksum);
      assert.equal(report.after.forged, 3);
      assert.equal(report.after.continuum, 0);
      assert.equal(report.partialIndex, true);
      assert.equal(report.oldConstraintDropped, true);
      assert.equal(report.resultsTable, true);

      const after = await sql`SELECT id, architect_id, name, mission_id, parts, fixes, boost, recipe FROM forged_qbits ORDER BY id`;
      assert.deepEqual(after, before);
      const origins = await sql`SELECT DISTINCT origin FROM forged_qbits`;
      assert.deepEqual(origins, [{ origin: 'forged' }]);
      const indexes = await sql`SELECT indexname FROM pg_indexes WHERE indexname = ${PARTIAL_INDEX_NAME}`;
      assert.equal(indexes.length, 1);
      const constraints = await sql`SELECT conname FROM pg_constraint WHERE conname = 'forged_qbits_architect_id_mission_id_key'`;
      assert.equal(constraints.length, 0);

      // The partial index rejects a duplicate forged insert, naming the index.
      await assert.rejects(
        sql`INSERT INTO forged_qbits (architect_id, name, role, mission_id, timestamp, origin)
          VALUES ('arch-1', 'dup', 'r', 'harmonic_tuning', 1, 'forged')`,
        new RegExp(PARTIAL_INDEX_NAME)
      );

      // Idempotent: a second run changes nothing.
      const again = await migrateContinuumQbits(sql);
      assert.equal(again.after.total, 3);
      assert.equal(again.after.checksum, report.after.checksum);
      const afterAgain = await sql`SELECT id, architect_id, name, mission_id, parts, fixes, boost, recipe FROM forged_qbits ORDER BY id`;
      assert.deepEqual(afterAgain, before);
  });

  test('fresh schema.sql already carries the new shape; migration is a no-op', async () => {
    const { sql } = await freshNewShapeDb();
      const indexes = await sql`SELECT indexname FROM pg_indexes WHERE indexname = ${PARTIAL_INDEX_NAME}`;
      assert.equal(indexes.length, 1);
      const report = await migrateContinuumQbits(sql);
      assert.equal(report.before.total, 0);
      assert.equal(report.after.total, 0);
      assert.equal(report.before.checksum, report.after.checksum);
      assert.equal(report.partialIndex, true);
      assert.equal(report.oldConstraintDropped, false);
  });

  test('community seed loads through the partial-index upsert with origin forged', async () => {
    const { sql } = await freshOldShapeDb();
      await migrateContinuumQbits(sql);
      const first = await loadCommunityQbits(sql, seedQbits);
      assert.deepEqual(first, { inserted: 7, skipped: 1, total: 8 });
      const origins = await sql`SELECT DISTINCT origin FROM forged_qbits`;
      assert.deepEqual(origins, [{ origin: 'forged' }]);
      const second = await loadCommunityQbits(sql, seedQbits);
      assert.deepEqual(second, { inserted: 0, skipped: 8, total: 8 });
  });
});

describe('forged vs continuum saves', () => {
  test('forged re-save updates in place; continuum saves always insert and never alter a forged row', async () => {
    const { sql } = await freshOldShapeDb();
      await migrateContinuumQbits(sql);
      const created = await writeQbit(sql, sampleFields({ name: 'Forge One' }));
      assert.equal(created.length, 1);
      const forgedId = created[0].id;

      const updated = await writeQbit(sql, sampleFields({ name: 'Forge One Renamed', boost: 'N0' }));
      assert.equal(updated.length, 1);
      assert.equal(updated[0].id, forgedId, 'forged re-save must update the same row');
      assert.equal(updated[0].name, 'Forge One Renamed');
      let count = await sql`SELECT COUNT(*)::int AS n FROM forged_qbits`;
      assert.equal(count[0].n, 1);

      const forgedBefore = await sql`SELECT * FROM forged_qbits WHERE id = ${forgedId}`;

      const response = await writeQbit(sql, sampleFields({
        name: 'Continuum Answer',
        origin: 'continuum',
        origin_challenge_title: 'Unmapped Resonance, Sector 9',
      }));
      assert.equal(response.length, 1);
      assert.notEqual(response[0].id, forgedId, 'continuum save must be a new row');
      assert.equal(response[0].origin, 'continuum');
      assert.equal(response[0].origin_challenge_title, 'Unmapped Resonance, Sector 9');
      count = await sql`SELECT COUNT(*)::int AS n FROM forged_qbits`;
      assert.equal(count[0].n, 2);

      const forgedAfter = await sql`SELECT * FROM forged_qbits WHERE id = ${forgedId}`;
      assert.deepEqual(forgedAfter, forgedBefore, 'continuum save must not alter the forged row');

      const second = await writeQbit(sql, sampleFields({
        name: 'Continuum Answer Two',
        origin: 'continuum',
        origin_challenge_title: 'Unmapped Resonance, Sector 9',
      }));
      assert.notEqual(second[0].id, forgedId);
      assert.notEqual(second[0].id, response[0].id);
      count = await sql`SELECT COUNT(*)::int AS n FROM forged_qbits`;
      assert.equal(count[0].n, 3);

      const origins = await sql`SELECT DISTINCT origin FROM forged_qbits ORDER BY origin`;
      assert.deepEqual(origins, [{ origin: 'continuum' }, { origin: 'forged' }]);
      assert.ok(!JSON.stringify(origins).includes('original'));
  });

  test('writeQbit without an origin behaves exactly as today (forged upsert)', async () => {
    const { sql } = await freshOldShapeDb();
      await migrateContinuumQbits(sql);
      const fields = sampleFields({ name: 'Plain' });
      delete fields.origin;
      const rows = await writeQbit(sql, fields);
      assert.equal(rows[0].origin, 'forged');
      assert.equal(rows[0].origin_challenge_title, null);
  });

  after(async () => {
    if (sharedDb) {
      await sharedDb.close();
      sharedDb = null;
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Client: Invent UX, hints, difficulty flames, Continuum cards
// ---------------------------------------------------------------------------

describe('continuum.html task-7 UX (static)', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'continuum.html'), 'utf8');
  const store = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'forged-qbits-store.js'), 'utf8');

  test('shows flame count for difficulty instead of a placeholder', () => {
    assert.ok(page.includes("'🔥'.repeat(level)"));
  });

  test('invent banner text, Forge button, and sessionStorage resume', () => {
    assert.ok(page.includes('No Qbit in the network has this. Forge one.'));
    assert.ok(page.includes("window.location.href = '/resonance.html#forge'"), 'banner goes to the Resonance Forge card (step 19f)');
    assert.ok(page.includes("sessionStorage.setItem(INVENT_STORAGE_KEY"));
    assert.ok(page.includes('continuum.inventChallenge'));
    assert.ok(page.includes('function loadStoredInventChallenge()'));
    const init = page.slice(page.indexOf('async function initGame'), page.indexOf('function handleSourceSwitch'));
    assert.ok(init.includes('loadStoredInventChallenge()'));
    assert.ok(init.includes('applyServerMission(resumedInvent)'));
  });

  test('hint names the stuck role tags and still costs 15 once per challenge', () => {
    assert.ok(page.includes('function stuckRoleForHint()'));
    assert.ok(page.includes('function hintMessageForRole(role)'));
    assert.ok(page.includes('hintMessageForRole(stuckRoleForHint())'));
    assert.ok(page.includes('points -= 15'));
    assert.ok(page.includes("document.getElementById('hintText').innerText = msg"));
  });

  test('continuum cards show origin line via textContent', () => {
    assert.ok(page.includes("'Continuum Qbit · Response to '"));
    assert.ok(page.includes('[data-origin-title]'));
  });

  test('store sends continuum origin + title only while an Invent challenge is pending', () => {
    assert.ok(store.includes("sessionStorage.getItem('continuum.inventChallenge')"));
    assert.ok(store.includes("payload.origin = 'continuum'"));
    assert.ok(store.includes('payload.origin_challenge_title'));
  });
});
