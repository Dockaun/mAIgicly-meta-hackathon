'use strict';
// Restore migration (hackathon step 19).
//
// Cause of the guide miscount: the Forge saves Qbits under the browser's
// current architect_id, but an Operator Code restore swaps the browser to the
// code's id without moving the rows. The pre-restore id's Qbits are orphaned:
// /api/guide truthfully counts 0 under the new id while the player owns 5,
// which Resonance still shows from its id-agnostic local cache and the
// Continuum covers with demo padding ("Yours (5)").
//
// Restore time is the only moment both ids are known, so the restore flow
// calls migrateForgedQbits() to reassign the rows. After that the guide
// counts the same Qbits the Continuum shows.
//
// migrateForgedQbits(sql, {operatorId, fromId, toId}):
// - verifies operator_ids maps operatorId to toId, else throws code 403;
// - moves every forged_qbits row under fromId to toId (both origins);
// - on a forged (architect_id, mission_id) clash the restored account's row
//   wins and the incoming row is deleted (reported as dropped);
// - resolves {migrated, dropped}. Same id is a no-op; missing ids throw 400.

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

async function migrateForgedQbits(sql, options) {
  const opts = (options && typeof options === 'object') ? options : {};
  const operatorId = typeof opts.operatorId === 'string' ? opts.operatorId.trim() : '';
  const fromId = typeof opts.fromId === 'string' ? opts.fromId : '';
  const toId = typeof opts.toId === 'string' ? opts.toId : '';
  if (!operatorId) fail(400, 'operator_id required');
  if (!fromId) fail(400, 'from_architect_id required');
  if (!toId) fail(400, 'to_architect_id required');
  if (fromId === toId) return { migrated: 0, dropped: 0 };

  const code = operatorId.toUpperCase().trim();
  let owners = [];
  try {
    owners = await sql`SELECT architect_id FROM operator_ids WHERE operator_id = ${code} LIMIT 1`;
  } catch (e) { owners = []; }
  if (!Array.isArray(owners) || !owners[0] || owners[0].architect_id !== toId) {
    fail(403, 'Operator code does not own this session');
  }

  let keptMissions = [];
  try {
    keptMissions = await sql`SELECT mission_id FROM forged_qbits
      WHERE architect_id = ${toId} AND origin = 'forged'`;
  } catch (e) { keptMissions = []; }
  const kept = new Set(
    (Array.isArray(keptMissions) ? keptMissions : [])
      .map((r) => r && r.mission_id)
      .filter((m) => typeof m === 'string'),
  );

  let incoming = [];
  try {
    incoming = await sql`SELECT id, mission_id, origin FROM forged_qbits WHERE architect_id = ${fromId}`;
  } catch (e) { incoming = []; }
  if (!Array.isArray(incoming)) incoming = [];

  // Delete-first so the reassignment can never violate the partial unique
  // index on (architect_id, mission_id) WHERE origin = 'forged'.
  let dropped = 0;
  for (const row of incoming) {
    if (row && row.origin === 'forged' && typeof row.mission_id === 'string' && kept.has(row.mission_id)) {
      await sql`DELETE FROM forged_qbits WHERE id = ${row.id}`;
      dropped += 1;
    }
  }

  await sql`UPDATE forged_qbits SET architect_id = ${toId} WHERE architect_id = ${fromId}`;
  return { migrated: incoming.length - dropped, dropped };
}

module.exports = { migrateForgedQbits };
