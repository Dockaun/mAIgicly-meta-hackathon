'use strict';
// Community pool seed loader.
//
// Inserts each Qbit from db/seed/community-qbits.json (pre-existing player
// creations, committed in 668c61a) into forged_qbits with visibility 'public'.
// Every game field from the seed is stored: name, role, mission_id, look,
// parts, fixes, boost, emblem, recipe, mechanism.
//
// Each seed entry gets its own anonymous owner
// ('00000000-0000-4000-8000-c0de000000NN', NN = 01, 02, ... by seed order), so
// the forged_qbits rule of one row per (architect_id, mission_id) never
// collapses distinct player creations that share a mission. Exact duplicates
// (same name, mission_id, boost, parts, fixes) are skipped, so the loader is
// idempotent and safe to re-run. These rows are the shared multiplayer pool:
// never delete them.
//
// Usage (server stopped):
//   PGLITE_DATA_DIR=./.data/pglite node db/seed/load-community-qbits.js

const fs = require('fs');
const path = require('path');

const SEED_OWNER_PREFIX = '00000000-0000-4000-8000-c0de000000';

function communityOwnerFor(index) {
  return `${SEED_OWNER_PREFIX}${String(index + 1).padStart(2, '0')}`;
}

function dupKeyOf(name, missionId, boost, parts, fixes) {
  return JSON.stringify([name, missionId, boost || '', parts || [], fixes || []]);
}

function seedDupKey(qbit) {
  return dupKeyOf(qbit.name, qbit.mission_id, qbit.boost, qbit.parts, qbit.fixes);
}

function rowDupKey(row) {
  const norm = (value) => {
    if (value === null || value === undefined) return [];
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [];
      }
    }
    return value;
  };
  return dupKeyOf(row.name, row.mission_id, row.boost, norm(row.parts), norm(row.fixes));
}

// loadCommunityQbits(sql, qbits): sql is a neon/PGlite tagged-template client.
// Returns {inserted, skipped, total}.
async function loadCommunityQbits(sql, qbits) {
  const list = Array.isArray(qbits) ? qbits : [];
  const existing =
    (await sql`SELECT name, mission_id, boost, parts, fixes FROM forged_qbits WHERE architect_id LIKE ${`${SEED_OWNER_PREFIX}%`}`) ||
    [];
  const have = new Set(existing.map(rowDupKey));
  let inserted = 0;
  let skipped = 0;
  for (let index = 0; index < list.length; index++) {
    const qbit = list[index];
    if (!qbit || !qbit.name || !qbit.mission_id) {
      skipped += 1;
      continue;
    }
    if (have.has(seedDupKey(qbit))) {
      skipped += 1;
      continue;
    }
    await sql`
      INSERT INTO forged_qbits (
        architect_id, name, role, mission_id, look, parts, fixes, boost,
        emblem, recipe, mechanism, story, timestamp, visibility, view_count
      ) VALUES (
        ${communityOwnerFor(index)},
        ${qbit.name},
        ${qbit.role || 'Community Qbit'},
        ${qbit.mission_id},
        ${JSON.stringify(qbit.look || {})},
        ${JSON.stringify(Array.isArray(qbit.parts) ? qbit.parts : [])},
        ${JSON.stringify(Array.isArray(qbit.fixes) ? qbit.fixes : [])},
        ${qbit.boost || ''},
        ${JSON.stringify(qbit.emblem || {})},
        ${qbit.recipe === undefined ? null : JSON.stringify(qbit.recipe)},
        ${qbit.mechanism || ''},
        ${qbit.story || ''},
        ${Date.now()},
        'public',
        0
      )
      ON CONFLICT (architect_id, mission_id) WHERE origin = 'forged' DO NOTHING
    `;
    have.add(seedDupKey(qbit));
    inserted += 1;
  }
  return { inserted, skipped, total: list.length };
}

async function main() {
  const dataDir = process.env.PGLITE_DATA_DIR || './.data/pglite';
  process.env.PGLITE_DATA_DIR = dataDir;
  const sql = require('../../server/local-sql').createLocalSql();
  const seedPath = path.join(__dirname, 'community-qbits.json');
  const qbits = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const result = await loadCommunityQbits(sql, qbits);
  const counted =
    (await sql`SELECT COUNT(*)::int AS n FROM forged_qbits WHERE architect_id LIKE ${`${SEED_OWNER_PREFIX}%`}`) ||
    [];
  const rowCount = counted && counted[0] ? counted[0].n : 'unknown';
  console.log(
    `[seed] community pool: inserted=${result.inserted} skipped=${result.skipped} total=${result.total} rows=${rowCount}`
  );
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error('[seed] failed:', (err && err.message) || err);
      process.exit(1);
    }
  );
}

module.exports = { SEED_OWNER_PREFIX, communityOwnerFor, loadCommunityQbits };
