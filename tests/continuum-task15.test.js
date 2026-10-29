'use strict';
// Hackathon step 15: guide fixes, Network Analysis panel, Invent round trip.
// (node:test + node:assert only). All model clients are fakes; no network.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const guide = require('../server/guide');
const { stripEmDash } = require('../server/reply-text');
const analysis = require('../server/continuum-analysis');
const { generateChallenge } = require('../server/continuum-meta');
const { registerContinuumRoutes } = require('../server/continuum-routes');
const { machineProbe } = require('../server/machine-context');

function fakeClientFor(content, calls) {
  return {
    chat: {
      completions: {
        create: async (params) => {
          if (calls) calls.push(params);
          return { choices: [{ message: { content } }] };
        },
      },
    },
  };
}

const POOL = [
  { id: 1, name: 'Alpha Qbit', capabilities: ['entangle', 'superposition'] },
  { id: 2, name: 'Beta Qbit', capabilities: ['tunnel'] },
  { id: 3, name: 'Gamma Qbit', capabilities: ['ground', 'collapse'] },
  { id: 4, name: 'Delta Qbit', capabilities: ['phase-lock'] },
  { id: 5, name: 'Eps Qbit', capabilities: ['entangle', 'collapse'] },
  { id: 6, name: 'Zed Qbit', capabilities: ['hybrid'] },
  { id: 7, name: 'Eta Qbit', capabilities: ['phase-control'] },
  { id: 8, name: 'Theta Qbit', capabilities: ['superposition', 'tunnel'] },
];
const AVAIL_ROLES = [
  { id: 'r1', name: 'Link', req: ['entangle'] },
  { id: 'r2', name: 'Sink', req: ['ground'] },
];

describe('A1: relaxed guard rejects only fix-part pairs and orders', () => {
  test('naming or describing Guardians passes', () => {
    assert.equal(guide.violatesGuideRules('Refrax is the Light Weaver.'), null);
    assert.equal(guide.violatesGuideRules('Magnetica and Chrona hold the field steady.'), null);
    assert.equal(guide.violatesGuideRules('Violet Flicker ignites the first possibility.'), null);
  });

  test('each order word with a Guardian name rejects', () => {
    const cases = [
      'Restore Refrax first.',
      'Start with Magnetica.',
      'Do Chrona next.',
      'Finish Refrax before Magnetica.',
      'Restore Magnetica, then Chrona.',
      'Begin with Violet Flicker.',
    ];
    for (const reply of cases) {
      assert.equal(guide.violatesGuideRules(reply), 'order', reply);
    }
  });

  test('order words without a Guardian name pass; other sentences do not leak', () => {
    assert.equal(guide.violatesGuideRules('First, choose any Guardian.'), null);
    assert.equal(guide.violatesGuideRules('Chrona keeps time. Then forge a Qbit.'), null);
    assert.equal(guide.violatesGuideRules('Next: enter the Continuum.'), null);
  });

  test('fix-part pairs still reject; lone codes or parts pass', () => {
    assert.equal(guide.violatesGuideRules('Use F:: with the Hall Sensor.'), 'fix-part');
    assert.equal(guide.violatesGuideRules('Hold SH steady.'), null);
    assert.equal(guide.violatesGuideRules('The Readout measures.'), null);
    assert.equal(guide.violatesGuideRules(''), null);
    assert.equal(guide.violatesGuideRules(null), null);
  });

  test('rejection logs the reason, never the reply text', async () => {
    const lines = [];
    const origLog = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    try {
      const merged = guide.mergeProgress({ server: { qbits: 1 }, client: {} });
      const out = await guide.answerGuide({
        architectId: 'arch-15', merged, question: '',
        limiter: guide.createRateLimiter({}),
        chatFn: async () => 'Restore Refrax first, friend.',
      });
      assert.equal(out.source, 'offline');
      assert.ok(lines.some((l) => l.includes('[Guide] rejected reason=order')), lines.join('\n'));
      assert.ok(!lines.join('\n').includes('Restore Refrax first'), 'reply text never logged');
    } finally {
      console.log = origLog;
    }
  });
});

describe('A2: system prompt states location and exact facts', () => {
  test('continuum status words', () => {
    assert.equal(guide.continuumStatus({}), 'locked');
    assert.equal(guide.continuumStatus({ restored: ['refrax'], forgeAvailable: true }), 'locked');
    assert.equal(guide.continuumStatus({ qbits: 2 }), 'unstable');
    assert.equal(guide.continuumStatus({ qbits: 3 }), 'stable');
    assert.equal(
      guide.continuumStatus({ restored: ['refrax', 'magnetica', 'chrona', 'violetflicker'], qbits: 5,
        missions: ['harmonic_tuning', 'entanglement', 'coherence_stitching', 'energy_absorption', 'stealth_masking'] }),
      'full');
  });

  test('prompt carries location, facts, and no-contradiction rule', () => {
    const merged = guide.mergeProgress({
      server: { restored: ['refrax', 'chrona'], forgeAvailable: true, qbits: 1 },
      client: {},
    });
    const [, user] = guide.buildMessages({
      stage: merged.stage, summary: merged.summary, question: '', progress: merged.progress,
    });
    void user;
    const [system] = guide.buildMessages({
      stage: merged.stage, summary: merged.summary, question: '', progress: merged.progress,
    });
    assert.ok(system.content.includes('Resonance hub screen'), 'location stated');
    assert.ok(system.content.includes('NOT inside the Quantum Forge or the Continuum'), 'not Forge/Continuum');
    assert.ok(system.content.includes('chambers restored 2/4'), 'chambers fact');
    assert.ok(system.content.includes('Forge available: yes'), 'forge fact');
    assert.ok(system.content.includes('Qbits forged: 1'), 'qbits fact');
    assert.ok(system.content.includes('Continuum: unstable'), 'continuum fact');
    assert.ok(system.content.includes('never contradict them'), 'no-contradiction rule');
  });

  test('questions are answered first, then the next step', () => {
    const merged = guide.mergeProgress({ server: {}, client: {} });
    const [, user] = guide.buildMessages({
      stage: merged.stage, summary: merged.summary, question: 'Who is Refrax?', progress: merged.progress,
    });
    assert.ok(user.content.includes('Who is Refrax?'));
    assert.ok(user.content.includes('Answer that question first'));
    assert.ok(user.content.includes('then state the next step'));
  });
});

describe('A3: em dashes stripped from Machine replies', () => {
  test('stripEmDash cases', () => {
    assert.equal(stripEmDash('one — two'), 'one, two');
    assert.equal(stripEmDash('one — two. Three.'), 'one, two. Three.');
    assert.equal(stripEmDash('a — b — c'), 'a, b, c');
    assert.equal(stripEmDash('no dashes here'), 'no dashes here');
    assert.equal(stripEmDash('trailing — '), 'trailing,');
    assert.equal(stripEmDash(null), null);
  });

  test('answerGuide strips model replies', async () => {
    const merged = guide.mergeProgress({ server: {}, client: {} });
    const out = await guide.answerGuide({
      architectId: 'arch-15b', merged, question: '',
      limiter: guide.createRateLimiter({}),
      chatFn: async () => 'My systems — failing. Choose one.',
    });
    assert.equal(out.source, 'meta');
    assert.ok(!out.reply.includes('—'), out.reply);
  });

  test('machineProbe strips model replies', async () => {
    const reply = await machineProbe(
      { mission: 'harmonic_tuning', parts: [], fixes: [], boost: '', testResult: '' },
      { client: fakeClientFor('The build hums — but stays open.') }
    );
    assert.ok(!reply.includes('—'), reply);
  });

  test('machine-hint route strips via the shared helper', () => {
    const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    assert.ok(src.includes("require('./server/reply-text')"), 'helper required');
    const route = src.slice(src.indexOf("app.post('/api/machine-hint'"));
    assert.ok(route.includes('stripEmDash(await chat('), 'hint stripped');
  });
});

describe('A4-A6: guide client statics', () => {
  const src = fs.readFileSync(path.join(root, 'public', 'js', 'machine-guide.js'), 'utf8');

  test('mobile bubble: 3-line clamp and 8s auto-hide', () => {
    assert.ok(src.includes('max-width:768px'), '768px media query');
    assert.ok(src.includes('-webkit-line-clamp:3'), '3-line clamp');
    assert.ok(src.includes('8000'), '8s auto-hide');
  });

  test('first appearance: pulse 3 cycles, label 4s, once per browser', () => {
    assert.ok(src.includes('machineGuide.orbSeen'), 'orb-seen flag');
    assert.ok(src.includes('mg-first 1s ease-in-out 3'), '3 pulse cycles');
    assert.ok(src.includes('4000'), 'label shows 4s');
    assert.ok(src.includes('prefers-reduced-motion'), 'motion respected');
  });

  test('chime: Web Audio, after first gesture, once per browser', () => {
    assert.ok(src.includes('AudioContext'), 'Web Audio chime');
    assert.ok(src.includes('pointerdown'), 'after tap/click');
    assert.ok(src.includes('machineGuide.chimed'), 'once per browser');
    assert.ok(!src.includes('.mp3') && !src.includes('.wav'), 'no audio file');
  });
});

describe('A5: resonance footer static on mobile', () => {
  test('768px media makes the footer static; desktop stays fixed', () => {
    const src = fs.readFileSync(path.join(root, 'public', 'resonance.html'), 'utf8');
    const media = src.slice(src.indexOf('@media (max-width: 768px)'));
    assert.ok(media.includes('position: static'), 'static on mobile');
    assert.ok(src.includes('.site-footer {\n      position: fixed;'), 'fixed on desktop');
  });
});

describe('B1: analysis builder', () => {
  test('scan line shows total and per-capability counts', () => {
    const line = analysis.scanLine(analysis.capabilityCounts(POOL));
    assert.ok(line.startsWith('NETWORK SCAN: 8 QBITS'), line);
    assert.ok(line.includes('ENTANGLE x2'), line);
    assert.ok(line.includes('COLLAPSE x2'), line);
    assert.ok(line.includes('HYBRID x1'), line);
  });

  test('samples: 4-6 lines, half not in any solution, across seeds', () => {
    const members = analysis.solutionMemberIds(AVAIL_ROLES, POOL);
    assert.ok(members.size > 0, 'pool contains solvers');
    function mulberry(seed) {
      let s = seed;
      return () => {
        s |= 0; s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    for (let seed = 1; seed <= 10; seed++) {
      const lines = analysis.sampleLines(POOL, members, { random: mulberry(seed) });
      assert.ok(lines.length >= 4 && lines.length <= 6, `seed ${seed}: ${lines.length} lines`);
      for (const line of lines) {
        assert.ok(line.startsWith('NETWORK SAMPLE: '), line);
        assert.ok(/ · [A-Z-]+$/.test(line), line);
      }
      const names = lines.map((l) => l.slice('NETWORK SAMPLE: '.length).split(' · ')[0]);
      const nonSolvers = names.filter((name) => {
        const c = POOL.find((q) => q.name === name);
        return c && !members.has(String(c.id));
      });
      assert.ok(nonSolvers.length >= lines.length / 2, `seed ${seed}: half are non-solvers`);
      assert.ok(!lines.join(' ').includes('considered'), 'never framed as model-considered');
    }
  });

  test('invent-style pools (no solvers) still emit a full sample list', () => {
    const inventRoles = [
      { id: 'r1', name: 'Unmapped', reqAll: ['phase-lock', 'superposition'] },
      { id: 'r2', name: 'Anchor', req: ['phase-lock'] },
    ];
    const members = analysis.solutionMemberIds(inventRoles, POOL);
    assert.equal(members.size, 0, 'no pair can satisfy an invent challenge');
    const lines = analysis.sampleLines(POOL, members, { random: null });
    assert.equal(lines.length, 5);
    assert.ok(lines.every((l) => l.startsWith('NETWORK SAMPLE: ')));
  });

  test('sample list shrinks to preserve the invariant on solver-heavy pools', () => {
    const solvers = POOL.filter((c) => analysis.solutionMemberIds(AVAIL_ROLES, POOL).has(String(c.id)));
    const lines = analysis.sampleLines(solvers, analysis.solutionMemberIds(AVAIL_ROLES, solvers), { random: null });
    assert.deepEqual(lines, []);
  });

  test('rationale: valid passes; Qbit names, long, banned, empty rejected', () => {
    assert.equal(
      analysis.rationaleLine('A fair first trial of link and ground.', POOL, 1, 'available'),
      'A fair first trial of link and ground.');
    assert.equal(
      analysis.rationaleLine('Alpha Qbit will carry this easily.', POOL, 1, 'available'),
      'You\'re new to the network, so I\'m starting with one capability per role.');
    assert.equal(
      analysis.rationaleLine('word '.repeat(21).trim(), POOL, 1, 'available'),
      'You\'re new to the network, so I\'m starting with one capability per role.');
    assert.equal(analysis.rationaleLine('', POOL, 1, 'available'), 'You\'re new to the network, so I\'m starting with one capability per role.');
    assert.equal(analysis.rationaleLine(undefined, POOL, 2, 'available'), 'You\'ve proven steady hands, so I\'m pairing two capabilities per trial.');
    assert.equal(
      analysis.rationaleLine(undefined, POOL, 3, 'invent'),
      'No network Qbit carries this, so I\'m asking you to invent it.');
  });

  test('solver lines are exact', () => {
    assert.equal(analysis.solverLine('available', true), 'VERIFYING SOLUTION EXISTS ... ✓');
    assert.equal(
      analysis.solverLine('invent', true),
      'NO QBIT IN THE NETWORK CARRIES THIS COMBINATION. SOLVER: FORGEABLE ✓');
    assert.ok(analysis.solverLine('available', false).includes('UNPROVEN'));
    assert.ok(analysis.solverLine('invent', false).includes('UNPROVEN'));
  });

  test('buildAnalysis orders scan, samples, rationale, solver', () => {
    const lines = analysis.buildAnalysis({
      candidates: POOL, roles: AVAIL_ROLES, mode: 'available',
      difficulty: 1, verified: true, rationale: 'A fair trial.', random: null,
    });
    assert.ok(lines[0].startsWith('NETWORK SCAN:'), lines[0]);
    assert.ok(lines[lines.length - 2] === 'A fair trial.', lines.join('\n'));
    assert.ok(lines[lines.length - 1].includes('VERIFYING SOLUTION EXISTS'), lines.join('\n'));
    assert.ok(lines.slice(1, -2).every((l) => l.startsWith('NETWORK SAMPLE:')));
  });
});

describe('B1+B4: challenge responses carry analysis', () => {
  const ARCHITECT = 'architect-15';

  function makeHandler({ sql, client, ai } = {}) {
    const routes = {};
    const stubApp = { post: (path, fn) => { routes[path] = fn; } };
    registerContinuumRoutes(stubApp, () => sql, client ? { client } : {});
    if (ai) {
      process.env.CONTINUUM_AI_ENABLED = '1';
      process.env.MODEL_API_KEY = 'test-key';
    }
    return routes['/api/continuum/challenges/next'];
  }

  function fakeSql(ownRows, publicRows, results) {
    return (strings, ...values) => {
      const text = strings.join(' ');
      if (text.includes('continuum_results')) return Promise.resolve(results || []);
      if (text.includes('visibility')) return Promise.resolve(publicRows);
      return Promise.resolve(ownRows);
    };
  }

  async function postNext(handler, body) {
    const req = { body: body === undefined ? { architect_id: ARCHITECT } : body };
    return new Promise((resolve, reject) => {
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(obj) { resolve({ status: this.statusCode, json: obj }); },
      };
      Promise.resolve(handler(req, res)).catch(reject);
    });
  }

  function rows() {
    return {
      own: [
        { id: 1, name: 'Entangler', boost: 'EN≡', fixes: ['SH'] },
        { id: 2, name: 'Grounder', boost: 'N0', fixes: ['C//'] },
      ],
      pub: [
        { id: 3, name: 'Tunneler', boost: 'G0', fixes: [] },
        { id: 4, name: 'Locker', boost: 'PH~', fixes: ['F::'] },
        { id: 5, name: 'Mixer', boost: 'N0', fixes: ['SH'] },
        { id: 6, name: 'Keeper', boost: 'G0', fixes: ['C//'] },
      ],
    };
  }

  test('meta challenge includes analysis with the model rationale', async () => {
    const prevAI = process.env.CONTINUUM_AI_ENABLED;
    const prevKey = process.env.MODEL_API_KEY;
    try {
      const { own, pub } = rows();
      const modelJson = JSON.stringify({
        title: 'Steady Test', brief: 'Hold still.',
        rationale: 'A calm first pairing drill.',
        roles: [
          { id: 'r1', name: 'Link', req: ['entangle'] },
          { id: 'r2', name: 'Sink', req: ['ground'] },
        ],
      });
      const handler = makeHandler({ sql: fakeSql(own, pub, []), client: fakeClientFor(modelJson), ai: true });
      const { json } = await postNext(handler);
      assert.equal(json.source, 'meta');
      assert.ok(Array.isArray(json.analysis), 'analysis array present');
      assert.ok(json.analysis[0].startsWith('NETWORK SCAN:'), json.analysis[0]);
      assert.ok(json.analysis.includes('A calm first pairing drill.'), 'model rationale used');
      assert.ok(json.analysis[json.analysis.length - 1].includes('VERIFYING SOLUTION EXISTS'), 'solver line');
    } finally {
      if (prevAI === undefined) delete process.env.CONTINUUM_AI_ENABLED; else process.env.CONTINUUM_AI_ENABLED = prevAI;
      if (prevKey === undefined) delete process.env.MODEL_API_KEY; else process.env.MODEL_API_KEY = prevKey;
    }
  });

  test('rationale naming a Qbit falls back to the deterministic line', async () => {
    const prevAI = process.env.CONTINUUM_AI_ENABLED;
    const prevKey = process.env.MODEL_API_KEY;
    try {
      const { own, pub } = rows();
      const modelJson = JSON.stringify({
        title: 'Steady Test', brief: 'Hold still.',
        rationale: 'Entangler will handle the link role.',
        roles: [
          { id: 'r1', name: 'Link', req: ['entangle'] },
          { id: 'r2', name: 'Sink', req: ['ground'] },
        ],
      });
      const handler = makeHandler({ sql: fakeSql(own, pub, []), client: fakeClientFor(modelJson), ai: true });
      const { json } = await postNext(handler);
      assert.equal(json.source, 'meta');
      assert.ok(!json.analysis.join('\n').includes('Entangler will handle'), 'leak rejected');
      assert.ok(json.analysis.includes('You\'re new to the network, so I\'m starting with one capability per role.'), 'fallback used');
    } finally {
      if (prevAI === undefined) delete process.env.CONTINUUM_AI_ENABLED; else process.env.CONTINUUM_AI_ENABLED = prevAI;
      if (prevKey === undefined) delete process.env.MODEL_API_KEY; else process.env.MODEL_API_KEY = prevKey;
    }
  });

  test('offline path returns deterministic analysis', async () => {
    const prevAI = process.env.CONTINUUM_AI_ENABLED;
    const prevKey = process.env.MODEL_API_KEY;
    const origRandom = Math.random;
    try {
      delete process.env.CONTINUUM_AI_ENABLED;
      delete process.env.MODEL_API_KEY;
      Math.random = () => 0.1;
      const { own, pub } = rows();
      const handler = makeHandler({ sql: fakeSql(own, pub, []) });
      const first = await postNext(handler);
      const second = await postNext(handler);
      Math.random = origRandom;
      assert.equal(first.json.source, 'offline');
      assert.ok(Array.isArray(first.json.analysis));
      assert.ok(first.json.analysis.includes('You\'re new to the network, so I\'m starting with one capability per role.'), 'fallback rationale');
      assert.deepEqual(first.json.analysis, second.json.analysis, 'offline lines deterministic');
    } finally {
      Math.random = origRandom;
      if (prevAI === undefined) delete process.env.CONTINUUM_AI_ENABLED; else process.env.CONTINUUM_AI_ENABLED = prevAI;
      if (prevKey === undefined) delete process.env.MODEL_API_KEY; else process.env.MODEL_API_KEY = prevKey;
    }
  });

  test('generator parses the rationale field', async () => {
    const challenge = await generateChallenge(
      [{ id: 'a', name: 'A', capabilities: ['entangle'] }, { id: 'b', name: 'B', capabilities: ['ground'] }],
      { client: fakeClientFor(JSON.stringify({
        title: 'T', brief: 'B', rationale: 'Why this fits.',
        roles: [{ id: 'r1', name: 'R1', req: ['entangle'] }, { id: 'r2', name: 'R2', req: ['ground'] }],
      })) }
    );
    assert.equal(challenge.rationale, 'Why this fits.');
  });
});

describe('B2/B3/B5: continuum panel client statics (step 17: thinking stage in the mission box)', () => {
  const src = fs.readFileSync(path.join(root, 'public', 'continuum.html'), 'utf8');

  test('right-column panel gone; thinking box lives in the mission box', () => {
    assert.ok(!src.includes('networkAnalysis'), 'old panel id gone everywhere');
    assert.ok(!src.includes('gr' + 'okAnalysis'), 'older id gone everywhere');
    assert.ok(!src.includes('renderMissionStats'), 'stats renderer gone with the panel');
    assert.ok(src.includes('id="thinkingLines"'), 'thinking box present');
  });

  test('lines typed one at a time, textContent only', () => {
    assert.ok(src.includes('typeAnalysisLines'), 'typing function kept');
    assert.ok(src.includes('400 * (index + 1)'), 'about 400ms apart');
    const fn = src.slice(src.indexOf('function typeAnalysisLines'));
    assert.ok(!fn.slice(0, 1600).includes('innerHTML'), 'no innerHTML in typer');
  });

  test('borrowed-Qbit credit line on success', () => {
    assert.ok(src.includes('appendNetworkCreditLines'), 'credit hook');
    assert.ok(src.includes('forged by another Operator, solved this with you.'), 'credit text');
  });

  test('no em dash left in Continuum UI text', () => {
    assert.ok(src.includes('carries the full signature. Forge it'), 'verified line fixed');
    for (const line of src.split('\n')) {
      if (line.includes('—')) {
        assert.ok(line.trim().startsWith('//'), `UI em dash remains: ${line.trim().slice(0, 60)}`);
      }
    }
  });
});

describe('C: forge request card and return trip', () => {
  const FORGES = ['forge.html', 'forge-magnetica.html', 'forge-chrona.html', 'forge-violetflicker.html'];
  const req = fs.readFileSync(path.join(root, 'public', 'js', 'continuum-request.js'), 'utf8');

  test('shared module: title + needs via textContent, never recipe data', () => {
    assert.ok(req.includes('Continuum Request'), 'card header');
    assert.ok(req.includes('textContent'), 'text-only rendering');
    for (const forbidden of ['mission_id', 'selectedParts', 'selectedFixes', 'selectedBoost', "'boost'"]) {
      assert.ok(!req.includes(forbidden), `card never touches ${forbidden}`);
    }
    assert.ok(req.includes('continuum.inventChallenge'), 'reads the stored request');
    assert.ok(req.includes("mode !== 'invent'"), 'validates Invent mode');
    assert.ok(req.includes('removeItem'), 'dismiss clears the request');
    assert.ok(req.includes('Return to the Continuum'), 'return label');
  });

  test('every forge page loads the module and hooks save + return', () => {
    for (const file of FORGES) {
      const src = fs.readFileSync(path.join(root, 'public', file), 'utf8');
      assert.ok(src.includes('<script src="/js/continuum-request.js"></script>'), `${file}: module loaded`);
      assert.ok(src.includes('continuum.newQbitId'), `${file}: NEW id stored`);
      assert.ok(src.includes('showReturnButton'), `${file}: return trip offered`);
      assert.ok(src.includes('ContinuumRequest.load()'), `${file}: request detected`);
      assert.ok(src.includes('if (!inventActive)'), `${file}: no auto-redirect on request`);
    }
  });

  test('faded requests get their own line and a fresh challenge', () => {
    const src = fs.readFileSync(path.join(root, 'public', 'continuum.html'), 'utf8');
    assert.ok(src.includes('That request faded. The Continuum has a new one.'), 'faded line');
  });
});

describe('C: request validation logic (stubbed browser)', () => {
  function loadModule(store) {
    const sandboxWindow = {};
    const sandboxDoc = {
      readyState: 'complete',
      getElementById: () => null,
      addEventListener: () => {},
    };
    const sandboxSession = {
      _map: new Map(Object.entries(store || {})),
      getItem(k) { return this._map.has(k) ? this._map.get(k) : null; },
      setItem(k, v) { this._map.set(k, String(v)); },
      removeItem(k) { this._map.delete(k); },
    };
    sandboxWindow.sessionStorage = sandboxSession;
    const fs = require('fs');
    const src = fs.readFileSync(path.join(root, 'public', 'js', 'continuum-request.js'), 'utf8');
    const factory = new Function('window', 'document', 'sessionStorage', `${src}\nreturn window.ContinuumRequest;`);
    const api = factory(sandboxWindow, sandboxDoc, sandboxSession);
    return { api, session: sandboxSession };
  }

  function inventData(overrides) {
    return Object.assign({
      id: 'inv-1',
      title: 'Unmapped Test',
      mode: 'invent',
      roles: [
        { id: 'r1', name: 'Unmapped', reqAll: ['phase-lock', 'superposition'], needs: 'Must hold and sync (one Qbit does both)' },
        { id: 'r2', name: 'Anchor', req: ['ground'], needs: 'Needs a Qbit that can drain noise' },
      ],
    }, overrides || {});
  }

  test('valid invent requests load; anything else is null', () => {
    const { api } = loadModule({ 'continuum.inventChallenge': JSON.stringify(inventData()) });
    const loaded = api.load();
    assert.ok(loaded && loaded.title === 'Unmapped Test');
    assert.equal(loadModule({}).api.load(), null);
    assert.equal(loadModule({ 'continuum.inventChallenge': 'not json' }).api.load(), null);
    assert.equal(loadModule({ 'continuum.inventChallenge': JSON.stringify(inventData({ mode: 'available' })) }).api.load(), null);
    assert.equal(loadModule({ 'continuum.inventChallenge': JSON.stringify(inventData({ roles: [] })) }).api.load(), null);
    assert.equal(loadModule({ 'continuum.inventChallenge': JSON.stringify(inventData({ title: '' })) }).api.load(), null);
  });

  test('clear() removes the stored request', () => {
    const { api, session } = loadModule({ 'continuum.inventChallenge': JSON.stringify(inventData()) });
    assert.ok(api.load());
    api.clear();
    assert.equal(session.getItem('continuum.inventChallenge'), null);
    assert.equal(api.load(), null);
  });
});

describe('D: invent completion hooks', () => {
  const src = fs.readFileSync(path.join(root, 'public', 'continuum.html'), 'utf8');

  test('newly forged Qbit highlighted with a NEW tag', () => {
    assert.ok(src.includes('continuum.newQbitId'), 'new id read');
    assert.ok(src.includes('● NEW'), 'NEW tag');
  });

  test('deploy still required: slots must fill, rules decide', () => {
    assert.ok(src.includes('Fill all slots first.'), 'deploy required');
    assert.ok(src.includes('roleSatisfiedBy(r, (r.qbit.capabilityTags || []))'), 'deterministic rules decide');
  });

  test('invent success text on invention', () => {
    assert.ok(src.includes("currentMode === 'invent'"), 'invent-gated');
    assert.ok(
      src.includes('New capability detected. The network can now do what it could not before. Your invention changed what is possible.'),
      'success text exact');
  });

  test('failure path: retry allowed, banner persists', () => {
    assert.ok(src.includes('INCOMPATIBLE CONFIGURATION'), 'local failure shown');
    const failBlock = src.slice(src.indexOf('INCOMPATIBLE CONFIGURATION'), src.indexOf('INCOMPATIBLE CONFIGURATION') + 800);
    assert.ok(failBlock.includes('deployBtn.disabled = false'), 'retry allowed');
  });
});
