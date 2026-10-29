#!/usr/bin/env node
/**
 * Schema-only initializer for a fresh Neon (or Neon-compatible) PostgreSQL database.
 * Does not import production records or credentials.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node db/init.js
 *
 * If DATABASE_URL is unset, exits 0 with a clear "not run" message.
 */
const fs = require('fs');
const path = require('path');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('[db/init] DATABASE_URL not set — schema initialization NOT RUN.');
    console.log('[db/init] Provide a Neon-compatible DATABASE_URL to initialize a fresh database.');
    process.exit(0);
  }

  const { neon } = require('@neondatabase/serverless');
  const sql = neon(url);
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  const statements = schema
    .split(';')
    .map(s => s.replace(/--[^\n]*/g, '').trim())
    .filter(Boolean);

  let ok = 0;
  let fail = 0;
  for (const stmt of statements) {
    try {
      await sql.query(stmt);
      ok++;
    } catch (e) {
      fail++;
      console.warn('[db/init] statement failed:', (e.message || String(e)).slice(0, 160));
    }
  }
  console.log(`[db/init] applied ${ok} statements (${fail} failed) against DATABASE_URL`);
  if (fail > 0) process.exit(1);
}

main().catch(err => {
  console.error('[db/init] fatal:', err.message);
  process.exit(1);
});
