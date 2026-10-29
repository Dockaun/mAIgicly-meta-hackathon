'use strict';
// Hackathon step 19: the Machine miscounts Qbits after an Operator Code
// restore. The Forge saves under the pre-restore browser id; restore swaps
// the browser to the code's id without moving the rows, so /api/guide (and a
// fresh Continuum load) counts 0 while the player owns 5. The fix migrates
// forged_qbits rows at restore time so the guide counts the same Qbits the
// Continuum shows.
// (node:test + node:assert only). One disposable PGlite under /tmp; run test
// files one at a time.
const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pglite-task19-test-'));
process.env.PGLITE_DATA_DIR = dataDir;
const { createLocalSql, getDb } = require('../server/local-sql');
const sql = createLocalSql();
const { migrateForgedQbits } = require('../server/restore-migrate');

after(async () => {
  try { await (await getDb()).close(); } catch (_) { /* ignore */ }
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
});

let seq = 0;
const uid = (p) => `${p}-T19-${Date.now()}-${seq++}`.toUpperCase();

async function seedQbit(architectId, missionId, name, origin) {
  await sql`INSERT INTO forged_qbits (architect_id, name, role, mission_id, timestamp, origin)
    VALUES (${architectId}, ${name}, 'anchor', ${missionId}, ${Date.now()}, ${origin || 'forged'})`;
}

// The exact COUNT the /api/guide route runs.
async function guideCount(architectId) {
  const rows = await sql`SELECT COUNT(*)::int AS total FROM forged_qbits WHERE architect_id = ${architectId}`;
  return Number(rows[0].total) || 0;
}

// The same filter the Continuum "Yours" tab loads (scope=continuum).
async function continuumLoad(architectId) {
  return sql`SELECT id, architect_id, name, mission_id, origin FROM forged_qbits
    WHERE architect_id = ${architectId} ORDER BY created_at DESC LIMIT 50`;
}

async function seedCode(operatorId, architectId) {
  await sql`INSERT INTO operator_ids (operator_id, architect_id) VALUES (${operatorId}, ${architectId})`;
}

describe('restore migration reunites pre-restore Qbits', () => {
  test('moves forged rows so guide and Continuum agree', async () => {
    const from = uid('from'), to = uid('to'), code = uid('CODE');
    await seedCode(code, to);
    const missions = ['m1', 'm2', 'm3', 'm4', 'm5'];
    for (const m of missions) await seedQbit(from, m, `Qbit ${m}`);
    assert.equal(await guideCount(to), 0, 'pre-migration guide counts 0 (the bug)');
    const out = await migrateForgedQbits(sql, { operatorId: code, fromId: from, toId: to });
    assert.deepEqual(out, { migrated: 5, dropped: 0 });
    assert.equal(await guideCount(to), 5, 'guide counts the migrated Qbits');
    assert.equal(await guideCount(from), 0, 'nothing left under the old id');
    const loaded = await continuumLoad(to);
    assert.equal(loaded.length, 5, 'Continuum loads the same 5 rows');
    assert.deepEqual(
      loaded.map((r) => r.mission_id).sort(),
      missions.slice().sort(),
    );
  });

  test('restored account wins forged conflicts per mission', async () => {
    const from = uid('from'), to = uid('to'), code = uid('CODE');
    await seedCode(code, to);
    await seedQbit(to, 'm1', 'To keeps this');
    await seedQbit(from, 'm1', 'From loses this');
    await seedQbit(from, 'm2', 'From moves this');
    const out = await migrateForgedQbits(sql, { operatorId: code, fromId: from, toId: to });
    assert.deepEqual(out, { migrated: 1, dropped: 1 });
    const loaded = await continuumLoad(to);
    assert.equal(loaded.length, 2);
    const m1 = loaded.find((r) => r.mission_id === 'm1');
    assert.equal(m1.name, 'To keeps this', 'restored account row survives');
  });

  test('continuum-origin rows move without conflict checks', async () => {
    const from = uid('from'), to = uid('to'), code = uid('CODE');
    await seedCode(code, to);
    await seedQbit(from, 'm1', 'Invented', 'continuum');
    const out = await migrateForgedQbits(sql, { operatorId: code, fromId: from, toId: to });
    assert.deepEqual(out, { migrated: 1, dropped: 0 });
    assert.equal((await continuumLoad(to)).length, 1);
  });

  test('rejects when the code does not own the target id', async () => {
    const from = uid('from'), to = uid('to'), other = uid('other');
    await seedCode(uid('CODE'), other);
    await seedQbit(from, 'm1', 'Stays put');
    await assert.rejects(
      migrateForgedQbits(sql, { operatorId: uid('WRONG'), fromId: from, toId: to }),
      (e) => e && e.code === 403,
      'unknown code rejected',
    );
    assert.equal(await guideCount(from), 1, 'no rows moved on rejection');
  });

  test('same id is a no-op; missing ids are rejected', async () => {
    const id = uid('id'), code = uid('CODE');
    await seedCode(code, id);
    await seedQbit(id, 'm1', 'Untouched');
    assert.deepEqual(
      await migrateForgedQbits(sql, { operatorId: code, fromId: id, toId: id }),
      { migrated: 0, dropped: 0 },
    );
    await assert.rejects(
      migrateForgedQbits(sql, { operatorId: code, fromId: '', toId: id }),
      (e) => e && e.code === 400,
    );
  });
});

describe('wiring statics', () => {
  test('server.js exposes POST /api/restore-migrate with ownership check', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.ok(src.includes("app.post('/api/restore-migrate'"), 'route registered');
    assert.ok(src.includes('migrateForgedQbits'), 'route uses the migrate module');
    assert.ok(src.includes('restore-migrate'), 'log tag present');
  });

  test('restore flow captures the pre-restore id and posts it', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
    assert.ok(src.includes('/api/restore-migrate'), 'restore calls the migrate endpoint');
    assert.ok(src.includes('from_architect_id'), 'pre-restore id sent as from_architect_id');
  });
});
