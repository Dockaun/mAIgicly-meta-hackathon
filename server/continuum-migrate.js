'use strict';
// Continuum Qbits storage migration (hackathon step 7).
//
// Additive and idempotent; safe to run at every startup on either the fresh
// schema (db/schema.sql, which already carries the new shape) or an older
// database:
//
//   1. forged_qbits gains origin TEXT NOT NULL DEFAULT 'forged'
//      ('forged' | 'continuum'; no 'original' rows are ever created) and
//      origin_challenge_title TEXT (nullable, validated title, max 60).
//   2. A partial unique index on (architect_id, mission_id) WHERE
//      origin = 'forged' replaces the old table-wide UNIQUE
//      (architect_id, mission_id), so Continuum responses (always new rows)
//      coexist with one forged row per architect+mission.
//   3. continuum_results (architect_id, challenge_id, passed, created_at)
//      records judged attempts for adaptive difficulty.
//
// The migration never modifies an existing row or recipe: existing rows get
// origin 'forged' from the column DEFAULT. It reports row counts and a recipe
// checksum before/after so callers can prove nothing changed.

const PARTIAL_INDEX_NAME = 'forged_qbits_architect_mission_forged_uidx';
const OLD_CONSTRAINT_NAME = 'forged_qbits_architect_id_mission_id_key';
const PROBE_ARCHITECT = 'migration-probe-continuum-step7';

async function tableStats(sql) {
  const counts = (await sql`SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE origin = 'forged')::int AS forged,
      COUNT(*) FILTER (WHERE origin = 'continuum')::int AS continuum
    FROM forged_qbits`) || [];
  // Fall back for databases where the origin column does not exist yet: the
  // query above throws, so this line never runs there. Kept simple instead.
  const row = counts[0] || { total: 0, forged: 0, continuum: 0 };
  const sums = (await sql`SELECT COALESCE(md5(string_agg(COALESCE(recipe::text, ''), '|' ORDER BY id)), 'empty') AS checksum FROM forged_qbits`) || [];
  return {
    total: Number(row.total) || 0,
    forged: Number(row.forged) || 0,
    continuum: Number(row.continuum) || 0,
    checksum: (sums[0] && sums[0].checksum) || 'empty',
  };
}

async function tableStatsPreOrigin(sql) {
  const counts = (await sql`SELECT COUNT(*)::int AS total FROM forged_qbits`) || [];
  const sums = (await sql`SELECT COALESCE(md5(string_agg(COALESCE(recipe::text, ''), '|' ORDER BY id)), 'empty') AS checksum FROM forged_qbits`) || [];
  return {
    total: (counts[0] && Number(counts[0].total)) || 0,
    checksum: (sums[0] && sums[0].checksum) || 'empty',
  };
}

async function indexExists(sql) {
  const rows = (await sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${PARTIAL_INDEX_NAME}`) || [];
  return rows.length > 0;
}

async function oldConstraintExists(sql) {
  const rows = (await sql`SELECT conname FROM pg_constraint WHERE conname = ${OLD_CONSTRAINT_NAME}`) || [];
  return rows.length > 0;
}

async function cleanupProbe(sql) {
  try {
    await sql`DELETE FROM forged_qbits WHERE architect_id = ${PROBE_ARCHITECT}`;
  } catch {
    // Best effort: a leftover probe row only affects the probe mission.
  }
}

// probeDuplicateRejected(sql): insert one probe row, then attempt a second
// forged row with the same (architect_id, mission_id). Resolves true only
// when the second insert fails AND the failure names the partial index (or,
// before the old constraint is dropped, fails on either uniqueness guard —
// the caller re-probes after the drop to prove the new index holds alone).
// Always removes its probe rows before resolving.
async function probeDuplicateRejected(sql, { requirePartialIndex = false } = {}) {
  await cleanupProbe(sql);
  try {
    await sql`INSERT INTO forged_qbits (architect_id, name, role, mission_id, timestamp, origin)
      VALUES (${PROBE_ARCHITECT}, 'probe', 'probe', 'probe-mission', ${Date.now()}, 'forged')`;
  } catch (err) {
    await cleanupProbe(sql);
    return false;
  }
  let rejected = false;
  let namedPartial = false;
  try {
    await sql`INSERT INTO forged_qbits (architect_id, name, role, mission_id, timestamp, origin)
      VALUES (${PROBE_ARCHITECT}, 'probe', 'probe', 'probe-mission', ${Date.now()}, 'forged')`;
  } catch (err) {
    rejected = true;
    namedPartial = String((err && err.message) || '').includes(PARTIAL_INDEX_NAME);
  }
  await cleanupProbe(sql);
  if (!rejected) return false;
  if (requirePartialIndex && !namedPartial) return false;
  return true;
}

// migrateContinuumQbits(sql): run the step-7 storage migration. Resolves a
// report {before, after, partialIndex, oldConstraintDropped, resultsTable}.
// Never throws on query failures: each step is attempted, and the report says
// what held. Probe rows are always cleaned up.
async function migrateContinuumQbits(sql) {
  const report = {
    before: { total: 0, checksum: 'unknown' },
    after: { total: 0, checksum: 'unknown' },
    partialIndex: false,
    oldConstraintDropped: false,
    resultsTable: false,
  };
  if (!sql) return report;

  try {
    report.before = await tableStatsPreOrigin(sql);
  } catch {
    report.before = { total: 0, checksum: 'unknown' };
  }

  try {
    await sql`ALTER TABLE forged_qbits ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'forged'`;
  } catch (err) {
    console.warn('[continuum-migrate] origin column:', String((err && err.message) || err).slice(0, 120));
  }
  try {
    await sql`ALTER TABLE forged_qbits ADD COLUMN IF NOT EXISTS origin_challenge_title TEXT`;
  } catch (err) {
    console.warn('[continuum-migrate] origin_challenge_title column:', String((err && err.message) || err).slice(0, 120));
  }
  try {
    await sql`CREATE TABLE IF NOT EXISTS continuum_results (
      architect_id TEXT NOT NULL,
      challenge_id TEXT NOT NULL,
      passed BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    report.resultsTable = true;
  } catch (err) {
    console.warn('[continuum-migrate] continuum_results:', String((err && err.message) || err).slice(0, 120));
  }
  try {
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS forged_qbits_architect_mission_forged_uidx ON forged_qbits (architect_id, mission_id) WHERE origin = 'forged'`;
  } catch (err) {
    console.warn('[continuum-migrate] partial index:', String((err && err.message) || err).slice(0, 120));
  }

  // Verify the partial index exists and rejects a duplicate forged insert,
  // THEN drop the old table-wide unique constraint. Re-probe after the drop
  // to prove the new index holds uniqueness alone.
  try {
    report.partialIndex = await indexExists(sql);
  } catch {
    report.partialIndex = false;
  }
  if (report.partialIndex) {
    let preDropHolds = false;
    try {
      preDropHolds = await probeDuplicateRejected(sql);
    } catch {
      preDropHolds = false;
    }
    if (preDropHolds) {
      try {
        const existedBefore = await oldConstraintExists(sql).catch(() => false);
        await sql`ALTER TABLE forged_qbits DROP CONSTRAINT IF EXISTS forged_qbits_architect_id_mission_id_key`;
        const existsAfter = await oldConstraintExists(sql).catch(() => true);
        report.oldConstraintDropped = existedBefore && !existsAfter;
      } catch (err) {
        console.warn('[continuum-migrate] drop old constraint:', String((err && err.message) || err).slice(0, 120));
      }
      let postDropHolds = false;
      try {
        postDropHolds = await probeDuplicateRejected(sql, { requirePartialIndex: true });
      } catch {
        postDropHolds = false;
      }
      if (!postDropHolds) {
        console.warn('[continuum-migrate] post-drop probe did not hold; uniqueness state unclear');
      }
      report.partialIndex = postDropHolds;
    } else {
      console.warn('[continuum-migrate] pre-drop duplicate probe failed; old constraint kept');
    }
  }

  try {
    report.after = await tableStats(sql);
  } catch {
    try {
      const pre = await tableStatsPreOrigin(sql);
      report.after = { ...pre, forged: pre.total, continuum: 0 };
    } catch {
      report.after = { total: 0, forged: 0, continuum: 0, checksum: 'unknown' };
    }
  }
  return report;
}

function logMigrationReport(report) {
  const before = report.before || {};
  const after = report.after || {};
  const match =
    before.total === after.total && before.checksum === after.checksum ? 'MATCH' : 'MISMATCH';
  console.log(
    `[continuum-migrate] forged_qbits before={rows:${before.total} checksum:${before.checksum}} ` +
    `after={rows:${after.total} forged:${after.forged} continuum:${after.continuum} checksum:${after.checksum}} ${match} ` +
    `partial_index=${report.partialIndex ? 'ok' : 'MISSING'} old_constraint_dropped=${report.oldConstraintDropped} results_table=${report.resultsTable ? 'ok' : 'MISSING'}`
  );
}

module.exports = {
  PARTIAL_INDEX_NAME,
  OLD_CONSTRAINT_NAME,
  migrateContinuumQbits,
  logMigrationReport,
};
