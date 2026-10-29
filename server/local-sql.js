/**
 * Neon-compatible tagged-template SQL adapter backed by PGlite.
 * Used only for local/disposable development when no Neon DATABASE_URL is available.
 * Does not replace the production Neon path.
 */
const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    const dataDir = process.env.PGLITE_DATA_DIR || path.join('/tmp', 'maigicly-pglite');
    dbPromise = (async () => {
      const db = new PGlite(dataDir);
      const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        const statements = schema
          .split(';')
          .map(s => s.replace(/--[^\n]*/g, '').trim())
          .filter(Boolean);
        for (const stmt of statements) {
          try { await db.exec(stmt); }
          catch (e) { console.warn('[local-sql] schema stmt:', e.message?.slice(0, 120)); }
        }
      }
      console.log('[local-sql] disposable PGlite ready at', dataDir);
      return db;
    })();
  }
  return dbPromise;
}

function flatten(strings, values) {
  let text = '';
  const params = [];
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (v && v.__fragment) {
        // renumber nested params
        let frag = v.text;
        const base = params.length;
        frag = frag.replace(/\$(\d+)/g, (_, n) => '$' + (base + Number(n)));
        text += frag;
        params.push(...v.params);
      } else {
        params.push(v === undefined ? null : v);
        text += '$' + params.length;
      }
    }
  }
  return { text, params };
}

function sql(strings, ...values) {
  if (strings && strings.raw) {
    const built = flatten(strings, values);
    // Fragment/thenable (hackathon steps 12b + 13): a top-level sql`` that
    // is never awaited (fire-and-forget analytics INSERTs) still executes —
    // execution is scheduled on the next tick. A fragment embedded in a
    // parent query composes into the one parent statement instead: reading
    // text/params (which flatten() does synchronously in the same tick)
    // cancels the scheduled run, so nested fragments never run alone and
    // bare pieces like `AND architect_id = $1` never reach PGlite (12b).
    let execPromise = null;
    let settled = false;
    const run = () => {
      if (!execPromise) {
        execPromise = (async () => {
          const db = await getDb();
          const result = await db.query(built.text, built.params);
          return result.rows || [];
        })();
      }
      return execPromise;
    };
    let timer = null;
    const cancel = () => {
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    timer = setTimeout(() => {
      timer = null;
      if (settled) return;
      settled = true;
      // Conditional no-op fragments (sql``) carry no statement: nothing to run.
      if (built.text.trim() === '') return;
      // Fire-and-forget failures are warnings, never unhandled rejections.
      run().catch((e) => console.warn('[local-sql] fire-and-forget:', e.message?.slice(0, 120)));
    }, 0);
    if (timer.unref) timer.unref();
    return {
      __fragment: true,
      get text() { cancel(); return built.text; },
      get params() { cancel(); return built.params; },
      then(onFulfilled, onRejected) { cancel(); return run().then(onFulfilled, onRejected); },
      catch(onRejected) { cancel(); return run().then(undefined, onRejected); },
      finally(onFinally) { cancel(); return run().finally(onFinally); },
    };
  }
  throw new Error('local-sql must be used as a tagged template');
}

module.exports = { createLocalSql: () => sql, getDb };
