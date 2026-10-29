#!/usr/bin/env node
/**
 * Automated checks for schema initialization and Qbit save / read / reload / Multiplay retrieval.
 *
 * Requires a disposable Neon-compatible DATABASE_URL.
 * If DATABASE_URL is unset, reports UNRUN and exits 0 (does not claim success).
 *
 * Usage:
 *   DATABASE_URL=postgres://... node tests/qbit-persistence.test.js
 */
const path = require('path');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('UNRUN: DATABASE_URL not set.');
    console.log('Tests for schema init + Qbit save/read/reload/Multiplay retrieval were not executed.');
    console.log('Provide a disposable Neon-compatible DATABASE_URL to run them.');
    process.exit(0);
  }

  const { neon } = require('@neondatabase/serverless');
  const sql = neon(url);

  const results = [];
  const check = (name, cond, detail = '') => {
    results.push({ name, pass: !!cond, detail });
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  // 1. Schema tables exist (init must have been run, or we attempt a minimal ensure)
  try {
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('forged_qbits', 'operator_ids', 'forge_sessions')
    `;
    const names = tables.map(t => t.table_name);
    check('schema.forged_qbits exists', names.includes('forged_qbits'));
    check('schema.operator_ids exists', names.includes('operator_ids'));
    check('schema.forge_sessions exists', names.includes('forge_sessions'));
  } catch (e) {
    check('schema query', false, e.message);
    summarize(results);
    process.exit(1);
  }

  const architectId = 'test-arch-' + Date.now();
  const missionId = 'harmonic_tuning';
  const qbitName = 'TestQbit';

  // 2. Save (insert)
  try {
    await sql`
      INSERT INTO forged_qbits (
        architect_id, name, role, mission_id, look, parts, fixes, boost,
        emblem, story, mechanism, recipe, timestamp, visibility
      ) VALUES (
        ${architectId}, ${qbitName}, 'Harmonic', ${missionId},
        ${JSON.stringify({ color: 'cyan' })}::jsonb,
        ${JSON.stringify(['coil'])}::jsonb,
        ${JSON.stringify(['tune'])}::jsonb,
        'boost-a',
        ${JSON.stringify({})}::jsonb,
        'test story', 'test mechanism',
        ${JSON.stringify({})}::jsonb,
        ${Date.now()}, 'public'
      )
    `;
    check('qbit save (insert)', true);
  } catch (e) {
    check('qbit save (insert)', false, e.message);
  }

  // 3. Read
  try {
    const rows = await sql`SELECT name, mission_id FROM forged_qbits WHERE architect_id = ${architectId}`;
    check('qbit read', rows.length === 1 && rows[0].name === qbitName);
  } catch (e) {
    check('qbit read', false, e.message);
  }

  // 4. Reload / upsert
  try {
    await sql`
      INSERT INTO forged_qbits (
        architect_id, name, role, mission_id, look, parts, fixes, boost,
        emblem, story, timestamp, visibility
      ) VALUES (
        ${architectId}, 'TestQbitReloaded', 'Harmonic', ${missionId},
        '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, 'boost-b',
        '{}'::jsonb, 'reloaded', ${Date.now()}, 'public'
      )
      ON CONFLICT (architect_id, mission_id) DO UPDATE SET name = EXCLUDED.name
    `;
    const rows = await sql`SELECT name FROM forged_qbits WHERE architect_id = ${architectId} AND mission_id = ${missionId}`;
    check('qbit reload/upsert', rows[0]?.name === 'TestQbitReloaded');
  } catch (e) {
    check('qbit reload/upsert', false, e.message);
  }

  // 5. Multiplay retrieval (scope=continuum style: own Qbits)
  try {
    const own = await sql`
      SELECT id, name FROM forged_qbits WHERE architect_id = ${architectId} ORDER BY created_at DESC
    `;
    check('multiplay continuum retrieval', own.length >= 1);
  } catch (e) {
    check('multiplay continuum retrieval', false, e.message);
  }

  // Cleanup disposable rows
  try {
    await sql`DELETE FROM forged_qbits WHERE architect_id = ${architectId}`;
  } catch (_) {}

  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed.`);
  process.exit(failed ? 1 : 0);
}

function summarize(results) {
  const failed = results.filter(r => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed.`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
