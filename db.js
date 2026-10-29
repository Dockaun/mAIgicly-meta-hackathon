const { neon } = require('@neondatabase/serverless');

let sql = null;

if (process.env.DATABASE_URL) {
  try {
    sql = neon(process.env.DATABASE_URL);
  } catch (e) {
    console.warn('[db] Failed to initialize Neon client:', e.message);
  }
}

module.exports = { sql };
