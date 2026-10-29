'use strict';
// Hackathon step 14: public-submission cleanup. My Forge, the removed
// controller, and training/LoRA/dataset-export code are removed; remaining
// admin routes require x-admin-token; qbit_rag.csv becomes guardian-lore.csv.
// (node:test + node:assert only; no network, no PGlite.)
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { requireAdminToken } = require('../server/admin-lock');

function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
}

describe('admin lock behavior (item 6)', () => {
  test('missing, wrong, or unconfigured token returns 404; correct token passes', () => {
    const prev = process.env.ADMIN_TOKEN;
    try {
      delete process.env.ADMIN_TOKEN;
      let nextCalls = 0;
      const next = () => { nextCalls++; };
      const r1 = fakeRes();
      requireAdminToken({ headers: { 'x-admin-token': 'anything' } }, r1, next);
      assert.equal(r1.statusCode, 404);
      assert.equal(nextCalls, 0);

      process.env.ADMIN_TOKEN = 'test-token-14';
      const r2 = fakeRes();
      requireAdminToken({ headers: {} }, r2, next);
      assert.equal(r2.statusCode, 404);
      const r3 = fakeRes();
      requireAdminToken({ headers: { 'x-admin-token': 'wrong' } }, r3, next);
      assert.equal(r3.statusCode, 404);
      assert.equal(nextCalls, 0);

      const r4 = fakeRes();
      requireAdminToken({ headers: { 'x-admin-token': 'test-token-14' } }, r4, next);
      assert.equal(r4.statusCode, null);
      assert.equal(nextCalls, 1);
    } finally {
      if (prev === undefined) delete process.env.ADMIN_TOKEN;
      else process.env.ADMIN_TOKEN = prev;
    }
  });

  test('step 14b: report/traffic/health endpoints behind the same lock', () => {
    const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    const at = src.indexOf('Step 14b');
    assert.ok(at !== -1, '14b lock present');
    const lockLine = src.slice(at, src.indexOf('\n', src.indexOf('requireAdminToken', at)));
    for (const p of ['/events-report', '/ratings-report', '/api/traffic-stats', '/api/analytics-health']) {
      assert.ok(lockLine.includes(`'${p}'`), `${p} in lock list`);
    }
    assert.ok(lockLine.includes('app.use'), 'mounted as middleware');
    assert.ok(
      at < src.indexOf("app.get('/events-report'"),
      'lock precedes route registration'
    );
  });

  test('server.js mounts the lock on /admin and /api/admin before static', () => {
    const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    assert.ok(src.includes("require('./server/admin-lock')"), 'lock required');
    assert.ok(src.includes("app.use('/admin', requireAdminToken)"), '/admin locked');
    assert.ok(src.includes("app.use('/api/admin', requireAdminToken)"), '/api/admin locked');
    assert.ok(
      src.indexOf("app.use('/admin', requireAdminToken)") <
        src.indexOf("express.static(path.join(__dirname, 'public'))"),
      'lock precedes the public static mount so public/admin is covered'
    );
  });
});

describe('removed routes and files (items 1-3)', () => {
  const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

  test('every removed route registration is gone from server.js', () => {
    for (const route of [
      '/api/my-forge/',
      '/api/learner/',
      '/api/phase3/',
      '/api/pinocch' + 'aio/',
      '/api/training/',
      '/api/admin/my-forge/',
      '/api/generate-training-pairs',
      '/api/export-lora-dataset',
      '/my-forge.html',
      "'/my-forge'",
    ]) {
      assert.ok(!src.includes(route), `removed: ${route}`);
    }
  });

  test('controller code and helpers are gone', () => {
    for (const symbol of [
      'learnerProfileStore',
      'phase3Router',
      'adapterRouter',
      'logMyForgeEvent',
      'buildProfileInjectedPrompt',
      'computePersonState',
      'computeContinuityScore',
      'buildControllerPrompt',
      'generateRejected',
      'MIN_SESSIONS_FOR_MY' + '_FORGE',
    ]) {
      assert.ok(!src.includes(symbol), `removed: ${symbol}`);
    }
    // buildWorldBrief stays: kept probe routes use it.
    assert.ok(src.includes('function buildWorldBrief('), 'shared prompt builder kept');
  });

  test('removed files are deleted', () => {
    for (const file of [
      'public/my-forge.html',
      'server/phase3-router.js',
      'server/adapter-router.js',
      'server/learner-profile-store.js',
    ]) {
      assert.ok(!fs.existsSync(path.join(root, file)), `deleted: ${file}`);
    }
  });
});

describe('preserved surface still intact', () => {
  const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

  test('kept routes still registered (admin ones now behind the lock)', () => {
    for (const route of [
      '/api/admin/player-report',
      '/admin/health',
      '/api/guide',
      '/api/forged-qbits',
      '/api/progress',
      '/api/forge-probe',
      '/api/chamber-probe',
      '/api/machine-hint',
      '/query',
      '/api/network-stats',
      '/resonance.html',
      // '/continuum.html' is served statically, never registered; its only
      // server.js mention was the legacy redirect removed in step 18.
    ]) {
      assert.ok(src.includes(route), `kept: ${route}`);
    }
    assert.ok(fs.existsSync(path.join(root, 'public', 'continuum.html')), 'page still served');
  });

  test('preserved pages and hackathon modules exist', () => {
    for (const file of [
      'public/index.html',
      'intro.html',
      'about.html',
      'public/select.html',
      'public/resonance.html',
      'public/continuum.html',
      'public/forge.html',
      'public/forge-guardian-select.html',
      'public/full-comic.html',
      'public/completion-log.html',
      'public/recovered-log.html',
      'public/js/machine-guide.js',
      'public/js/continuum-unlock.js',
      'server/guide.js',
      'server/meta-chat.js',
      'server/machine-context.js',
      'server/chamber-followup.js',
      'server/player-progress.js',
      'server/forged-qbits-write.js',
      'server/local-sql.js',
      'server/db.js',
      'db/schema.sql',
    ]) {
      assert.ok(fs.existsSync(path.join(root, file)), `kept: ${file}`);
    }
  });

  test('unlock keys renamed to continuum.* with legacy migration (step 18)', () => {
    const resonance = fs.readFileSync(path.join(root, 'public', 'resonance.html'), 'utf8');
    assert.ok(resonance.includes('continuum.unstable_unlocked'), 'unstable key renamed');
    assert.ok(resonance.includes('continuum.stable_unlocked'), 'stable key renamed');
    assert.ok(resonance.includes('continuum.full_unlocked'), 'full key renamed');
    assert.ok(resonance.includes('migrateLegacyKeys'), 'migration runs on load');
    const unlock = fs.readFileSync(path.join(root, 'public', 'js', 'continuum-unlock.js'), 'utf8');
    assert.ok(unlock.includes('migrateStorageKeys'), 'shared migration exported');
  });
});

describe('lore rename (item 8)', () => {
  test('guardian-lore.csv exists; qbit_rag.csv is gone', () => {
    assert.ok(fs.existsSync(path.join(root, 'public', 'data', 'guardian-lore.csv')));
    assert.ok(!fs.existsSync(path.join(root, 'public', 'data', 'qbit_rag.csv')));
  });

  test('server.js uses lore names; dialog.csv machinery untouched', () => {
    const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    assert.ok(src.includes('guardian-lore.csv'), 'new path loaded');
    assert.ok(src.includes('QBIT_LORE'), 'QBIT_LORE in use');
    assert.ok(src.includes('loadQbitLore'), 'loader renamed');
    assert.ok(!src.includes('QBIT_RAG'), 'no QBIT_RAG left');
    assert.ok(!src.includes('qbit_rag'), 'no qbit_rag left');
    assert.ok(src.includes('dialog.csv'), 'dialog.csv loader kept');
    assert.ok(src.includes('RAG_ROWS'), 'dialog rows kept');
  });
});

describe('dependency prune (item 7)', () => {
  test('sharp removed from package.json and lockfile', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    assert.ok(!('sharp' in all), 'sharp not a dependency');
    const lock = fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8');
    assert.ok(!lock.includes('"node_modules/sharp"'), 'sharp not in lockfile');
    for (const dep of ['express', 'cors', 'openai', 'csv-parser', 'drizzle-orm',
      '@neondatabase/serverless', '@electric-sql/pglite', 'drizzle-kit']) {
      assert.ok(dep in all, `${dep} kept (still imported)`);
    }
  });
});
