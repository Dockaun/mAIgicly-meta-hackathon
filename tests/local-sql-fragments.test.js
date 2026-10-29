'use strict';
// Hackathon steps 12b + 13: local-sql fragments. A nested sql`` inside a
// parent template must compose into the one parent query (correct $n
// numbering) and never runs alone — eager execution sent
// `AND architect_id = $1` to PGlite and the unhandled rejection crashed
// the server on POST /api/operator-id/confirm. A top-level sql`` that is
// never awaited (fire-and-forget analytics INSERTs) still executes via a
// next-tick run (step 13).
// (node:test + node:assert only; disposable PGlite under /tmp only.)
const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pglite-local-sql-test-'));
process.env.PGLITE_DATA_DIR = dataDir;
const { createLocalSql, getDb } = require('../server/local-sql');
const sql = createLocalSql();

// Record (and swallow, so the old eager code fails loudly instead of
// crashing the runner) any unhandled rejection from fragment execution.
const unhandled = [];
process.on('unhandledRejection', (err) => { unhandled.push(err); });

after(async () => {
  try { await (await getDb()).close(); } catch (_) { /* ignore */ }
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
});

describe('local-sql lazy fragments', () => {
  test('nested fragment composes into one query with correct $n numbering', async () => {
    await sql`CREATE TABLE frag_t (g TEXT, v TEXT)`;
    await sql`INSERT INTO frag_t (g, v) VALUES (${'g1'}, ${'v1'})`;
    await sql`INSERT INTO frag_t (g, v) VALUES (${'g1'}, ${'v2'})`;
    await sql`INSERT INTO frag_t (g, v) VALUES (${'g2'}, ${'v3'})`;
    const g = 'g1';
    const v = 'v2';
    const q = sql`SELECT v FROM frag_t WHERE g = ${g} ${v ? sql`AND v = ${v}` : sql``} ORDER BY v`;
    assert.match(q.text, /g = \$1/);
    assert.match(q.text, /v = \$2/);
    assert.deepEqual(q.params, ['g1', 'v2']);
    const rows = await q;
    assert.deepEqual(rows, [{ v: 'v2' }]);
  });

  test('empty sql`` fragment composes to nothing', async () => {
    const g = 'g1';
    const q = sql`SELECT v FROM frag_t WHERE g = ${g} ${false ? sql`AND v = ${'x'}` : sql``} ORDER BY v`;
    assert.ok(!/\$\d+/.test(q.text.replace('$1', '')), 'no extra placeholders');
    assert.deepEqual(q.params, ['g1']);
    const rows = await q;
    assert.deepEqual(rows, [{ v: 'v1' }, { v: 'v2' }]);
  });

  test('top-level await executes; .catch triggers execution without await', async () => {
    const rows = await sql`SELECT ${'hello'} AS w`;
    assert.deepEqual(rows, [{ w: 'hello' }]);
    let caught = false;
    await sql`SELECT * FROM no_such_table_12b`.catch(() => { caught = true; });
    assert.equal(caught, true);
    sql`CREATE TABLE catch_probe (id INT)`.catch(() => {});
    const deadline = Date.now() + 5000;
    for (;;) {
      const found = await sql`SELECT to_regclass('catch_probe') AS oid`;
      if (found[0] && found[0].oid) break;
      assert.ok(Date.now() < deadline, 'catch_probe table was created via .catch');
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  test('top-level fire-and-forget sql`` still executes (hackathon step 13)', async () => {
    await sql`CREATE TABLE IF NOT EXISTS ghost_t (v TEXT)`;
    await sql`DELETE FROM ghost_t`;
    // Never awaited, no .then/.catch — must still land, like the analytics
    // INSERTs in server.js.
    sql`INSERT INTO ghost_t (v) VALUES (${'ghost'})`;
    const deadline = Date.now() + 5000;
    for (;;) {
      const rows = await sql`SELECT v FROM ghost_t ORDER BY v`;
      if (rows.length === 1 && rows[0].v === 'ghost') break;
      assert.ok(Date.now() < deadline, 'fire-and-forget INSERT landed');
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.deepEqual(unhandled, [], 'no unhandled rejections from fragments');
  });

  test('a nested fragment never runs alone (hackathon step 13)', async () => {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
    try {
      await sql`CREATE TABLE IF NOT EXISTS ghost2_t (g TEXT, v TEXT)`;
      await sql`DELETE FROM ghost2_t`;
      await sql`INSERT INTO ghost2_t (g, v) VALUES (${'g1'}, ${'v1'})`;
      // `AND g = $n` alone is invalid SQL: if the nested fragment ran on its
      // own, the fire-and-forget path would log a warning for it.
      const g = 'g1';
      const q = sql`SELECT v FROM ghost2_t WHERE g = ${'g9'} ${sql`AND g = ${g}`} ORDER BY v`;
      const rows = await q;
      assert.deepEqual(rows, []);
      await new Promise((r) => setTimeout(r, 300));
      assert.ok(
        !warnings.some((w) => w.includes('[local-sql] fire-and-forget')),
        'nested fragment never executed standalone'
      );
    } finally {
      console.warn = origWarn;
    }
    assert.deepEqual(unhandled, [], 'no unhandled rejections from fragments');
  });
});
