'use strict';
// Forged-Qbit writes (shared by POST /api/forged-qbits and tests).
//
// writeQbit(sql, fields): origin 'forged' (default) runs today's upsert — one
// row per (architect_id, mission_id) updated in place — targeted at the
// partial unique index WHERE origin = 'forged'. Origin 'continuum' always
// inserts a new row and never updates or replaces a forged row.
// Resolves the raw result rows (empty on the Neon HTTP driver, which never
// returns RETURNING rows; the caller falls back to a minimal object).

const FORGED_ORIGIN = 'forged';
const CONTINUUM_ORIGIN = 'continuum';

async function writeQbit(sql, fields) {
  const origin = fields.origin || FORGED_ORIGIN;
  if (origin === CONTINUUM_ORIGIN) {
    return sql`
      INSERT INTO forged_qbits (
        architect_id, name, alias, role, mission_id, look, parts, fixes, boost,
        emblem, story, mechanism, recipe, image, timestamp, visibility, view_count, created_at,
        origin, origin_challenge_title
      ) VALUES (
        ${fields.architect_id}, ${fields.name}, ${fields.alias || null}, ${fields.role}, ${fields.mission_id},
        ${JSON.stringify(fields.look || {})}, ${JSON.stringify(Array.isArray(fields.parts) ? fields.parts : [])},
        ${JSON.stringify(Array.isArray(fields.fixes) ? fields.fixes : [])}, ${fields.boost},
        ${JSON.stringify(fields.emblem || {})}, ${fields.story || ''}, ${fields.mechanism || fields.story || ''}, ${JSON.stringify(fields.recipe || null)},
        ${fields.image || null}, ${fields.timestamp || Date.now()}, ${fields.visibility || 'public'}, 0, NOW(),
        ${CONTINUUM_ORIGIN}, ${fields.origin_challenge_title}
      )
      RETURNING *
    `;
  }
  return sql`
    INSERT INTO forged_qbits (
      architect_id, name, alias, role, mission_id, look, parts, fixes, boost,
      emblem, story, mechanism, recipe, image, timestamp, visibility, view_count, created_at,
      origin, origin_challenge_title
    ) VALUES (
      ${fields.architect_id}, ${fields.name}, ${fields.alias || null}, ${fields.role}, ${fields.mission_id},
      ${JSON.stringify(fields.look || {})}, ${JSON.stringify(Array.isArray(fields.parts) ? fields.parts : [])},
      ${JSON.stringify(Array.isArray(fields.fixes) ? fields.fixes : [])}, ${fields.boost},
      ${JSON.stringify(fields.emblem || {})}, ${fields.story || ''}, ${fields.mechanism || fields.story || ''}, ${JSON.stringify(fields.recipe || null)},
      ${fields.image || null}, ${fields.timestamp || Date.now()}, ${fields.visibility || 'public'}, 0, NOW(),
      ${FORGED_ORIGIN}, ${null}
    )
    ON CONFLICT (architect_id, mission_id) WHERE origin = 'forged' DO UPDATE SET
      name = EXCLUDED.name,
      alias = EXCLUDED.alias,
      role = EXCLUDED.role,
      look = EXCLUDED.look,
      parts = EXCLUDED.parts,
      fixes = EXCLUDED.fixes,
      boost = EXCLUDED.boost,
      emblem = EXCLUDED.emblem,
      story = EXCLUDED.story,
      mechanism = EXCLUDED.mechanism,
      recipe = EXCLUDED.recipe,
      image = EXCLUDED.image,
      timestamp = EXCLUDED.timestamp,
      visibility = EXCLUDED.visibility,
      origin = EXCLUDED.origin,
      origin_challenge_title = EXCLUDED.origin_challenge_title
    RETURNING *, (xmax = 0) AS was_inserted
  `;
}

module.exports = { FORGED_ORIGIN, CONTINUUM_ORIGIN, writeQbit };
