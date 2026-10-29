'use strict';
// Server-side unlock/points progress (hackathon step 11).
//
// Chamber completions (*.v3.complete) and Forge-gate points
// (quantum.global.points + quantum.chamber.*.earned) lived only in
// localStorage, so restoring by Operator Code never brought unlocks back.
// (Server Qbits, continuum_results level, and continuum-origin Qbits already
// follow architect_id.) Clients upload completion snapshots here and the
// restore flow downloads them back into localStorage.
//
// saveProgress(sql, architectId, flags) / getProgress(sql, architectId) take
// the same Neon-style `sql` tag the routes use; only PROGRESS_KEYS are
// accepted. Tests run these against a disposable PGlite; no network.

const PROGRESS_KEYS = [
  'refrax.v3.complete',
  'magnetica.v3.complete',
  'chrona.v3.complete',
  'violetflicker.v3.complete',
  'quantum.global.points',
  'quantum.chamber.refrax.earned',
  'quantum.chamber.magnetica.earned',
  'quantum.chamber.chrona.earned',
  'quantum.chamber.violetflicker.earned',
];

const MAX_FLAGS = 20;
const MAX_VALUE_LEN = 64;

function isProgressKey(key) {
  return typeof key === 'string' && PROGRESS_KEYS.includes(key);
}

function cleanFlags(flags) {
  const out = {};
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return out;
  for (const [key, value] of Object.entries(flags)) {
    if (!isProgressKey(key)) continue;
    const text = String(value === undefined || value === null ? '' : value);
    if (text.length > MAX_VALUE_LEN) continue;
    out[key] = text;
    if (Object.keys(out).length >= MAX_FLAGS) break;
  }
  return out;
}

async function saveProgress(sql, architectId, flags) {
  const clean = cleanFlags(flags);
  const keys = Object.keys(clean);
  for (const key of keys) {
    await sql`
      INSERT INTO player_progress (architect_id, flag, value, updated_at)
      VALUES (${architectId}, ${key}, ${clean[key]}, NOW())
      ON CONFLICT (architect_id, flag)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
  }
  return { saved: keys.length };
}

async function getProgress(sql, architectId) {
  const rows = await sql`
    SELECT flag, value FROM player_progress WHERE architect_id = ${architectId}
  `;
  const flags = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row && isProgressKey(row.flag)) flags[row.flag] = String(row.value ?? '');
  }
  return { flags };
}

module.exports = {
  PROGRESS_KEYS,
  MAX_FLAGS,
  MAX_VALUE_LEN,
  isProgressKey,
  cleanFlags,
  saveProgress,
  getProgress,
};
