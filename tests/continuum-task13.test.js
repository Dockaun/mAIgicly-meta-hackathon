'use strict';
// Hackathon step 13: the Machine as guide on the Resonance hub, plus
// local-sql fire-and-forget, operator_ids.confirmed_at, wording fixes.
// (node:test + node:assert only). All model clients are fakes; no network.
// One disposable PGlite (confirmed_at only) under /tmp; run test files one
// at a time.
const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const guide = require('../server/guide');
const shared = require('../public/js/continuum-capabilities');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pglite-task13-test-'));
process.env.PGLITE_DATA_DIR = dataDir;
const { createLocalSql, getDb } = require('../server/local-sql');
const sql = createLocalSql();

after(async () => {
  try { await (await getDb()).close(); } catch (_) { /* ignore */ }
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
});

const GUIDE_ORDERS = [
  [],
  ['refrax'],
  ['chrona', 'refrax'],
  ['refrax', 'chrona'],
  ['violetflicker', 'magnetica', 'chrona'],
  ['chrona', 'magnetica', 'violetflicker'],
  ['refrax', 'magnetica', 'chrona', 'violetflicker'],
  ['violetflicker', 'chrona', 'magnetica', 'refrax'],
];

describe('nextStep: every stage, any Guardian order', () => {
  test('nothing restored: choose any Guardian, no name, no order', () => {
    assert.equal(guide.nextStep({}), 'Choose any Guardian to restore.');
    assert.equal(guide.nextStep({ restored: [] }), 'Choose any Guardian to restore.');
    assert.equal(guide.stageFor({}), 'start');
  });

  test('partial guardians: "Choose another Guardian." plus count remaining', () => {
    assert.equal(guide.nextStep({ restored: ['magnetica'] }), 'Choose another Guardian. 3 remaining.');
    assert.equal(guide.nextStep({ restored: ['a', 'b'] }), 'Choose any Guardian to restore.');
    assert.equal(guide.stageFor({ restored: ['chrona'] }), 'guardians');
  });

  test('same restored set in any order gives the same line', () => {
    const byCount = {};
    for (const order of GUIDE_ORDERS) {
      const line = guide.nextStep({ restored: order });
      const n = new Set(order).size;
      if (byCount[n] === undefined) byCount[n] = line;
      assert.equal(line, byCount[n], `order ${order.join(',') || '(none)'}`);
    }
    assert.equal(byCount[2], 'Choose another Guardian. 2 remaining.');
    assert.equal(byCount[3], 'Choose another Guardian. 1 remaining.');
  });

  test('nextStep never names a Guardian at any stage', () => {
    const grid = [
      {},
      { restored: ['refrax'] },
      { restored: ['refrax', 'chrona'] },
      { forgeAvailable: true },
      { restored: ['magnetica'], forgeAvailable: true, qbits: 1 },
      { qbits: 2 },
      { qbits: 3 },
      { restored: GUIDE_ORDERS[6], qbits: 5, missions: [1, 2, 3] },
      { restored: GUIDE_ORDERS[6], qbits: 5, missions: guide.MISSIONS },
    ];
    for (const input of grid) {
      assert.ok(!/refrax|magnetica|chrona|violet/i.test(guide.nextStep(input)), JSON.stringify(input));
    }
  });

  test('forge available, 0 Qbits: forge the first Qbit', () => {
    assert.equal(
      guide.nextStep({ forgeAvailable: true }),
      'Forge your first Qbit. One Qbit wakes the Continuum.');
    assert.equal(guide.stageFor({ forgeAvailable: true, restored: ['refrax'] }), 'forge');
  });

  test('1-2 Qbits: unstable, enter now or forge more (x/3)', () => {
    assert.equal(
      guide.nextStep({ qbits: 1 }),
      'The Continuum is open but unstable. Enter it, or forge more Qbits to stabilize me. Qbits forged: 1/3.');
    assert.ok(guide.nextStep({ qbits: 2 }).includes('Qbits forged: 2/3.'));
    assert.equal(guide.stageFor({ qbits: 2 }), 'unstable');
  });

  test('3+ Qbits without Full: stable, chambers x/4 and missions x/5', () => {
    const line = guide.nextStep({ qbits: 4, restored: ['refrax', 'chrona'], missions: ['harmonic_tuning'] });
    assert.equal(
      line,
      'The Continuum is stable. Complete the remaining chambers and Forge missions ' +
      'to restore my full power. Chambers done: 2/4. Missions done: 1/5.');
    assert.equal(guide.stageFor({ qbits: 3 }), 'stable');
  });

  test('full: 4 chambers + 5 missions', () => {
    assert.equal(
      guide.nextStep({ restored: GUIDE_ORDERS[6], qbits: 5, missions: guide.MISSIONS }),
      'I am fully restored. Enter the Continuum.');
    // 4 chambers but 4 missions is not Full.
    assert.equal(
      guide.stageFor({ restored: GUIDE_ORDERS[6], qbits: 5, missions: guide.MISSIONS.slice(0, 4) }),
      'stable');
  });
});

describe('trusted progress: server values override client claims', () => {
  test('client cannot inflate qbits, chambers, or forge access', () => {
    const merged = guide.mergeProgress({
      server: { restored: [], forgeAvailable: false, qbits: 0, continuumAttempts: 0 },
      client: { missions: [], qbits: 9, restored: ['refrax'], forgeAvailable: true },
    });
    assert.equal(merged.stage, 'start');
    assert.equal(merged.nextStep, 'Choose any Guardian to restore.');
    assert.ok(merged.summary.includes('qbits forged 0'));
  });

  test('client cannot hide server-held progress', () => {
    const merged = guide.mergeProgress({
      server: { restored: ['refrax', 'magnetica'], forgeAvailable: true, qbits: 2, continuumAttempts: 3 },
      client: { missions: ['entanglement'] },
    });
    assert.equal(merged.stage, 'unstable');
    assert.ok(merged.summary.includes('guardians restored 2/4'));
    assert.ok(merged.summary.includes('continuum attempts 3'));
    assert.ok(merged.summary.includes(guide.GAME_MAP));
  });

  test('missions come only from the client snapshot', () => {
    const withMissions = guide.mergeProgress({
      server: { restored: GUIDE_ORDERS[6], forgeAvailable: true, qbits: 5 },
      client: { missions: guide.MISSIONS },
    });
    assert.equal(withMissions.stage, 'full');
    const without = guide.mergeProgress({
      server: { restored: GUIDE_ORDERS[6], forgeAvailable: true, qbits: 5 },
      client: {},
    });
    assert.equal(without.stage, 'stable');
  });
});

describe('voice and stage selection', () => {
  test('each stage has its own voice; rules always present', () => {
    const start = guide.buildSystemPrompt('start');
    assert.ok(/fragmented|uncertain/i.test(start), 'start is fragmented');
    const full = guide.buildSystemPrompt('full');
    assert.ok(/collaborator/i.test(full), 'full is a collaborator');
    for (const stage of ['start', 'guardians', 'forge', 'unstable', 'stable', 'full']) {
      const prompt = guide.buildSystemPrompt(stage);
      assert.ok(prompt.includes('Maximum 2 sentences'), `${stage}: 2 sentences`);
      assert.ok(prompt.includes('any order'), `${stage}: no Guardian order`);
      assert.ok(prompt.includes('Never give a Qbit recipe'), `${stage}: no recipes`);
      assert.ok(prompt.includes(guide.GAME_MAP), `${stage}: fixed map`);
    }
  });

  test('greeting carries stage + real progress; questions truncated to 200', () => {
    const merged = guide.mergeProgress({
      server: { restored: ['chrona'], forgeAvailable: false, qbits: 0 },
      client: {},
    });
    const [system, user] = guide.buildMessages({ stage: merged.stage, summary: merged.summary, question: '' });
    assert.ok(system.role === 'system' && user.role === 'user');
    assert.ok(user.content.includes('guardians restored 1/4'));
    assert.ok(user.content.includes('No question'));
    const long = guide.buildMessages({ stage: 'start', summary: 's', question: 'x'.repeat(500) });
    assert.equal(long[1].content.split('Player question: ')[1].split('\n')[0].length, 200);
  });

  test('replies are truncated to 2 sentences', () => {
    assert.equal(guide.truncateSentences('One. Two. Three.', 2), 'One. Two.');
    assert.equal(guide.truncateSentences('  Spaced   out!  Really?  Yes. ', 2), 'Spaced out! Really?');
  });
});

describe('guardrails: naming allowed, orders and fix+part pairs rejected (step 15)', () => {
  test('naming or describing Guardians is allowed; prescribing order is rejected', () => {
    assert.equal(guide.violatesGuideRules('Refrax weaves light from silicon and boron.'), null);
    assert.equal(guide.violatesGuideRules('Magnetica guides outcomes. Chrona keeps time.'), null);
    assert.equal(guide.violatesGuideRules('Choose any Guardian to restore.'), null);
    assert.equal(guide.violatesGuideRules('Restore Refrax first.'), 'order');
    assert.equal(guide.violatesGuideRules('Start with Magnetica.'), 'order');
    assert.equal(guide.violatesGuideRules('Restore Magnetica next, then Chrona.'), 'order');
  });

  test('never pairs SH/F::/C// with a part name', () => {
    for (const fix of ['SH', 'F::', 'C//']) {
      assert.equal(
        guide.violatesGuideRules(`Use ${fix} with the Phase Prism.`),
        'fix-part', fix);
    }
    assert.equal(guide.violatesGuideRules('Tune the Phase Prism gently.'), null);
    assert.equal(guide.violatesGuideRules('Hold every path open at once.'), null);
  });

  test('answerGuide falls back to the nextStep line on violation', async () => {
    const merged = guide.mergeProgress({ server: { qbits: 1 }, client: {} });
    const bad = await guide.answerGuide({
      architectId: 'arch-v',
      merged,
      question: '',
      limiter: guide.createRateLimiter({}),
      chatFn: async () => 'Use SH with the Readout for sure.',
    });
    assert.equal(bad.source, 'offline');
    assert.equal(bad.reply, merged.nextStep);
    const named = await guide.answerGuide({
      architectId: 'arch-v',
      merged,
      question: 'what now?',
      limiter: guide.createRateLimiter({}),
      chatFn: async () => 'Restore Magnetica next, then Chrona.',
    });
    assert.equal(named.source, 'offline');
    assert.equal(named.reply, merged.nextStep);
  });
});

describe('rate limit and offline fallback', () => {
  test('20 calls per architect per hour; the 21st returns nextStep only', async () => {
    let now = 1000000;
    const limiter = guide.createRateLimiter({ now: () => now });
    const merged = guide.mergeProgress({ server: {}, client: {} });
    let metaCalls = 0;
    const chatFn = async () => { metaCalls++; return 'My systems... failing. Choose one.'; };
    let last;
    for (let i = 0; i < 20; i++) {
      last = await guide.answerGuide({ architectId: 'arch-r', merged, limiter, chatFn });
      assert.equal(last.source, 'meta');
    }
    assert.equal(metaCalls, 20);
    last = await guide.answerGuide({ architectId: 'arch-r', merged, limiter, chatFn });
    assert.equal(last.source, 'offline');
    assert.equal(last.reply, merged.nextStep, 'rate-limited calls return nextStep only (step 19d)');
    assert.equal(metaCalls, 20, 'no Meta call past the limit');
    // Another architect is unaffected; the window expiry re-allows.
    const other = await guide.answerGuide({ architectId: 'arch-s', merged, limiter, chatFn });
    assert.equal(other.source, 'meta');
    now += 3600 * 1000 + 1;
    const renewed = await guide.answerGuide({ architectId: 'arch-r', merged, limiter, chatFn });
    assert.equal(renewed.source, 'meta');
  });

  test('offline: no key, timeout, and empty reply all return nextStep', async () => {
    const merged = guide.mergeProgress({ server: { qbits: 2 }, client: {} });
    const noKey = await guide.answerGuide({
      architectId: 'arch-o', merged, limiter: guide.createRateLimiter({}), chatFn: null,
    });
    assert.deepEqual(noKey, { reply: merged.nextStep, nextStep: merged.nextStep, stage: 'unstable', source: 'offline' });
    const throwing = await guide.answerGuide({
      architectId: 'arch-o', merged, limiter: guide.createRateLimiter({}),
      chatFn: async () => { throw new Error('meta_client_timeout'); },
    });
    assert.equal(throwing.source, 'offline');
    assert.equal(throwing.reply, merged.nextStep);
    const empty = await guide.answerGuide({
      architectId: 'arch-o', merged, limiter: guide.createRateLimiter({}),
      chatFn: async () => '   ',
    });
    assert.equal(empty.source, 'offline');
  });
});

describe('route wiring statics (server.js POST /api/guide)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  test('route exists, requires architect_id, trusts server values', () => {
    assert.ok(src.includes("app.post('/api/guide'"), 'route registered');
    assert.ok(src.includes('architect_id required'), '400 without architect_id');
    assert.ok(src.includes('FROM forged_qbits WHERE architect_id'), 'server Qbit count');
    assert.ok(src.includes('getProgress(sql, architect_id)'), 'Task 11 progress store');
    assert.ok(src.includes('FROM continuum_results WHERE architect_id'), 'server continuum results');
    assert.ok(src.includes('guide.mergeProgress'), 'trusted merge');
    assert.ok(src.includes('guide.answerGuide'), 'guide answer path');
  });

  test('Meta call is key-gated with the guide token budget', () => {
    const route = src.slice(src.indexOf('// POST /api/guide'));
    assert.ok(route.includes('MODEL_API_KEY'), 'key check');
    assert.ok(route.includes('GUIDE_MAX_TOKENS'), 'token budget');
    assert.ok(route.includes('createRateLimiter'), 'rate limiter');
  });
});

describe('item 5 statics: fire-and-forget scheduled, nesting cancels', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'local-sql.js'), 'utf8');

  test('next-tick run unless embedded; failures warn, never reject', () => {
    assert.ok(src.includes('setTimeout('), 'scheduled execution');
    assert.ok(src.includes('get text()'), 'embed detection on text');
    assert.ok(src.includes('get params()'), 'embed detection on params');
    assert.ok(src.includes('clearTimeout(timer)'), 'nesting cancels the run');
    assert.ok(src.includes('[local-sql] fire-and-forget:'), 'failure warning');
    assert.ok(src.includes("built.text.trim() === ''"), 'empty fragments stay inert');
  });
});

describe('item 6: operator_ids.confirmed_at persists server-side', () => {
  test('startup ALTER is additive and idempotent (server.js)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.ok(
      src.includes('ALTER TABLE operator_ids ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP'),
      'additive startup migration present');
  });

  test('old-schema table gains the column; confirm UPDATE persists', async () => {
    await sql`DROP TABLE IF EXISTS operator_ids`;
    await sql`CREATE TABLE operator_ids (
      operator_id TEXT PRIMARY KEY,
      architect_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      legacy_id TEXT
    )`;
    await sql`ALTER TABLE operator_ids ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP`;
    await sql`ALTER TABLE operator_ids ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP`;
    await sql`INSERT INTO operator_ids (operator_id, architect_id) VALUES (${'OP-T13'}, ${'arch-t13'})`;
    await sql`UPDATE operator_ids SET confirmed_at = NOW() WHERE operator_id = ${'OP-T13'}`;
    const rows = await sql`SELECT confirmed_at FROM operator_ids WHERE operator_id = ${'OP-T13'}`;
    assert.equal(rows.length, 1);
    assert.ok(rows[0].confirmed_at !== null, 'confirmation timestamp persisted');
  });
});

describe('item 7: slot needs read grammatically; offline descs canonical', () => {
  test('every phrase reads correctly in req and reqAll forms', () => {
    assert.equal(Object.keys(shared.TAG_PHRASES).length, 8, 'all 8 tags have phrases');
    for (const tag of shared.CAPABILITY_VOCAB) {
      assert.ok(shared.TAG_PHRASES[tag], `${tag} has a phrase`);
      const single = shared.needsTextForRole({ req: [tag] });
      assert.ok(single.startsWith('Needs a Qbit that can '), `${tag}: ${single}`);
      const pair = shared.needsTextForRole({ req: [tag, 'ground'] });
      assert.ok(pair.includes(' or '), `${tag} pair: ${pair}`);
      const all = shared.needsTextForRole({ reqAll: [tag, 'collapse'] });
      assert.ok(all.startsWith('Must ') && all.endsWith('(one Qbit does both)'), `${tag} all: ${all}`);
    }
  });

  test('both offline template descriptions avoid non-canonical words', async () => {
    const { OFFLINE_TEMPLATES } = require('../server/continuum-routes');
    assert.equal(OFFLINE_TEMPLATES.length, 2);
    for (const template of OFFLINE_TEMPLATES) {
      assert.ok(!/optical|magnetic|stealth|timing/i.test(template.desc), `${template.id} desc`);
    }
    const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'continuum.html'), 'utf8');
    for (const template of OFFLINE_TEMPLATES) {
      assert.ok(page.includes(template.desc), `${template.id} desc matches the page`);
    }
  });
});

describe('client overlay statics: fixed, safe, same look', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'resonance.html'), 'utf8');
  const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'machine-guide.js'), 'utf8');

  test('resonance.html gains exactly the one script line', () => {
    const tag = '<script defer src="/js/machine-guide.js"></script>';
    assert.ok(page.includes(tag), 'script included');
    assert.equal(page.indexOf(tag), page.lastIndexOf(tag), 'included once');
  });

  test('overlay is fixed-position, sized, and closable', () => {
    assert.ok(!client.includes('innerHTML'), 'no innerHTML anywhere');
    assert.ok(client.includes('textContent'), 'replies via textContent');
    assert.ok(client.includes('position:fixed'), 'fixed overlay');
    assert.ok(client.includes('width:48px') && client.includes('width:44px'), 'orb 48px, 44px mobile');
    assert.ok(client.includes('max-height:50vh'), 'panel max 50vh');
    assert.ok(client.includes('max-height:60vh'), 'mobile sheet max 60vh');
    assert.ok(client.includes('320px'), 'panel max 320px wide');
    assert.ok(client.includes("ev.key === 'Escape'"), 'Esc closes');
    assert.ok(client.includes('maxLength = 200') || client.includes('maxLength: 200'), 'question capped');
  });

  test('client sends missions only; server values win', () => {
    assert.ok(client.includes('mission.') && client.includes('.complete'), 'reads mission flags');
    assert.ok(client.includes('progress: { missions: missions }'), 'snapshot carries missions only');
  });

  test('bubble on first arrival and on stage change', () => {
    assert.ok(client.includes('machineGuide.seen'), 'first-arrival flag');
    assert.ok(client.includes('machineGuide.stage'), 'stage-change detection');
  });
});
