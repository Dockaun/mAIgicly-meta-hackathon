// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
// server.js — HYBRID RAG + GPT guardrails, no "Qbit:" prefix, stage shaping, concept-only RAG hints
const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const cors = require('cors');
const { registerContinuumRoutes } = require('./server/continuum-routes');
const { migrateContinuumQbits, logMigrationReport } = require('./server/continuum-migrate');
const { FORGED_ORIGIN, CONTINUUM_ORIGIN, writeQbit } = require('./server/forged-qbits-write');
const { chat } = require('./server/meta-chat');
const { followupProbe } = require('./server/chamber-followup');
const { machineProbe } = require('./server/machine-context');
const { saveProgress, getProgress } = require('./server/player-progress');
const guide = require('./server/guide');
const { requireAdminToken } = require('./server/admin-lock');
const { stripEmDash } = require('./server/reply-text');
const { migrateForgedQbits } = require('./server/restore-migrate');

// Hackathon step 12b: never crash the process on an async slip — log a short
// message (no secrets) and stay up.
process.on('unhandledRejection', (reason) => {
  const msg = reason && reason.message ? reason.message : String(reason);
  console.error('[fatal-guard] unhandledRejection:', String(msg).slice(0, 200));
});
process.on('uncaughtException', (err) => {
  const msg = err && err.message ? err.message : String(err);
  console.error('[fatal-guard] uncaughtException:', String(msg).slice(0, 200));
});

const app = express();

// ========== PROFANITY FILTER ==========
// Comprehensive bad-word list with common variants and l33t speak
const BAD_WORDS = [
  // Core profanity
  'fuck', 'fck', 'fuk', 'f*ck', 'f**k', 'fuq', 'phuck', 'phuk',
  'shit', 'sh1t', 'sh!t', 'sht', 's**t',
  'bitch', 'b1tch', 'b!tch', 'biatch',
  'ass', 'a55', 'a$$',
  'asshole', 'a55hole', 'assh0le',
  'damn', 'dammit', 'damnit',
  'crap',
  'dick', 'd1ck', 'd!ck',
  'cock', 'c0ck',
  'pussy', 'puss',
  'cunt', 'c*nt', 'cvnt',
  'whore', 'wh0re', 'hoe',
  'slut', 'sl*t',
  'bastard', 'bstrd',
  'piss', 'p1ss',
  'penis', 'pen1s',
  'vagina', 'vag',
  'boob', 'tit', 't1t',
  'porn', 'p0rn', 'pr0n',
  'sex', 's3x',
  'horny', 'h0rny',
  'cum', 'c*m', 'jizz',
  'fag', 'faggot', 'f4g',
  'gay', 'homo', 'queer', 'dyke', 'lesbo',
  'retard', 'r3tard', 'retrd',
  'nigger', 'n1gger', 'n!gger', 'nigga', 'n1gga',
  'chink', 'ch1nk',
  'spic', 'sp1c',
  'kike', 'k1ke',
  'wetback',
  'beaner',
  'cracker',
  'nazi', 'n4zi',
  'hitler', 'h1tler',
  'kill', 'k1ll', 'murder',
  'rape', 'r4pe',
  'pedo', 'ped0', 'pedophile',
  'molest',
  'suicide', 'suic1de',
  'terrorist', 'terror',
  'bomb', 'b0mb',
  'drugs', 'cocaine', 'heroin', 'meth', 'weed',
  // Common evasions
  'frick', 'frigg', 'effing',
  'biatch', 'beyotch',
  'heck', 'dang', 'darn',
  'butthole', 'butth0le',
  'jackass', 'jacka55',
  'dumbass', 'dumba55',
  'badass', 'bada55',
  'smartass', 'smarta55'
];

// Normalize text for comparison (removes common substitutions)
function normalizeForFilter(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a')
    .replace(/!/g, 'i')
    .replace(/\*/g, '')
    .replace(/[^a-z]/g, ''); // Remove non-letters for matching
}

// Check if string contains any bad word (using word boundary matching)
function containsBadWord(str) {
  if (!str) return false;
  const normalized = normalizeForFilter(str);
  const original = str.toLowerCase();
  
  // Split into "words" - chunks separated by non-letter characters or camelCase boundaries
  const getWords = (s) => {
    // Insert space before uppercase letters (camelCase), then split on non-letters
    return s.replace(/([A-Z])/g, ' $1').toLowerCase().split(/[^a-z]+/).filter(w => w.length > 0);
  };
  
  const originalWords = getWords(original);
  const normalizedWords = getWords(normalized);
  
  return BAD_WORDS.some(word => {
    const normalizedWord = normalizeForFilter(word);
    // Check if any word in the name matches a bad word exactly
    // Also check if the bad word appears as a standalone segment
    return originalWords.includes(word) || 
           normalizedWords.includes(normalizedWord) ||
           // For short bad words (3 chars or less), require exact word match
           // For longer bad words, also check substring to catch evasions like "f-u-c-k"
           (normalizedWord.length > 3 && normalized.includes(normalizedWord));
  });
}
// ========== END PROFANITY FILTER ==========
app.use(cors());

// Bot Path Blocker - blocks common vulnerability scan paths
app.use((req, res, next) => {
  const path = req.path.toLowerCase();
  const blockedPaths = [
    '/wp-admin/',
    '/wp-login.php',
    '/setup-config.php',
    '/wordpress/',
    '/phpmyadmin/',
    '/.env',
    '/config.php'
  ];
  
  // Check if path contains any blocked pattern
  if (blockedPaths.some(blocked => path.includes(blocked))) {
    return res.status(403).send('Forbidden');
  }
  
  next();
});

// Bot detection patterns
const BOT_PATTERNS = [
  /bot/i, /crawler/i, /spider/i, /scraper/i,
  /googlebot/i, /bingbot/i, /yandex/i, /duckduckbot/i,
  /baiduspider/i, /sogou/i, /exabot/i, /facebot/i,
  /ia_archiver/i, /slurp/i, /wget/i, /curl/i,
  /python/i, /java\//i, /perl/i, /ruby/i,
  /go-http/i, /okhttp/i, /axios/i, /node-fetch/i,
  /headless/i, /phantom/i, /selenium/i, /puppeteer/i,
  /ahrefsbot/i, /semrushbot/i, /mj12bot/i, /dotbot/i
];

function isBot(userAgent) {
  if (!userAgent) return true;
  return BOT_PATTERNS.some(pattern => pattern.test(userAgent));
}

function hashIP(ip) {
  if (!ip) return 'unknown';
  return crypto.createHash('sha256').update(ip + 'maigicly-salt').digest('hex').slice(0, 16);
}

// HTTP Request Logger (with DB persistence)
app.use((req, res, next) => {
  const startTime = Date.now();
  
  const originalEnd = res.end;
  
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    const timestamp = new Date().toISOString();
    const userAgent = req.headers['user-agent'] || 'no-agent';
    const referrer = req.headers['referer'] || req.headers['referrer'] || null;
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'unknown';
    const isBotRequest = isBot(userAgent);
    
    const logLine = `[${timestamp}] ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms - ${userAgent.slice(0, 50)}`;
    console.log(logLine);
    
    // Log to database (non-blocking, skip assets to reduce noise)
    const skipPaths = ['.js', '.css', '.png', '.jpg', '.ico', '.woff', '.svg', '.map'];
    const shouldLog = !skipPaths.some(ext => req.url.includes(ext));
    
    if (shouldLog && typeof sql !== 'undefined' && sql) {
      sql`
        INSERT INTO request_log (method, path, status_code, duration_ms, user_agent, referrer, ip_hash, is_bot)
        VALUES (${req.method}, ${req.url.slice(0, 500)}, ${res.statusCode}, ${duration}, ${userAgent.slice(0, 500)}, ${referrer}, ${hashIP(clientIP)}, ${isBotRequest})
      `.catch(err => console.error('Request log error:', err.message));
    }
    
    originalEnd.apply(res, args);
  };
  
  next();
});

// Serve sprites with CORS headers for canvas access
app.use('/sprites', (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  next();
}, express.static(path.join(__dirname, 'public', 'sprites')));

// Serve payoff video directory with explicit MIME type for iOS Safari
app.use('/payoff', (req, res, next) => {
  if (req.path.endsWith('.mp4')) {
    res.set('Content-Type', 'video/mp4');
  }
  next();
}, express.static(path.join(__dirname, 'payoff')));

// Disable caching for HTML files (aggressive for Safari)
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
    res.set('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT');
    res.set('Pragma', 'no-cache');
    res.set('Surrogate-Control', 'no-store');
    res.set('Vary', '*');
  }
  next();
});

app.use('/assets', express.static(path.join(__dirname, 'public/assets'), {
  maxAge: '7d',
  etag: true,
  lastModified: true
}));
// Legacy redirect — must be before static middleware so the file is never served
app.get('/select.html', (req, res) => {
  res.redirect(301, '/resonance.html');
});
// Force no-cache on forge.html so iPhone Safari never serves a stale copy
function serveForge(req, res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  res.sendFile(path.join(__dirname, 'public', 'forge.html'));
}
app.get('/forge', serveForge);
app.get('/forge.html', serveForge);
app.get('/forge-magnetica',         (req, res) => res.sendFile(path.join(__dirname, 'public', 'forge-magnetica.html')));
app.get('/forge-magnetica.html',    (req, res) => res.sendFile(path.join(__dirname, 'public', 'forge-magnetica.html')));
app.get('/forge-violetflicker',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'forge-violetflicker.html')));
app.get('/forge-violetflicker.html',(req, res) => res.sendFile(path.join(__dirname, 'public', 'forge-violetflicker.html')));
app.get('/forge-chrona',            (req, res) => res.sendFile(path.join(__dirname, 'public', 'forge-chrona.html')));
app.get('/forge-chrona.html',       (req, res) => res.sendFile(path.join(__dirname, 'public', 'forge-chrona.html')));
app.get('/forge-guardian-select',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'forge-guardian-select.html')));
app.get('/forge-guardian-select.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'forge-guardian-select.html')));

// Force no-cache on resonance.html so browsers never serve a stale copy
function serveResonance(req, res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  res.sendFile(path.join(__dirname, 'public', 'resonance.html'));
}
app.get('/resonance', serveResonance);
app.get('/resonance.html', serveResonance);

// Admin lock (hackathon step 14): placed before the static mount so the
// public/admin pages are locked too. Wrong or missing token => 404.
app.use('/admin', requireAdminToken);
app.use('/api/admin', requireAdminToken);
// Step 14b: report/traffic/health endpoints behind the same lock.
app.use(['/events-report', '/ratings-report', '/api/traffic-stats', '/api/analytics-health'], requireAdminToken);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '5mb' }));
app.use(express.text({ type: 'text/plain' }));
app.use(require('./routes/machine-chat-log'));

// Serve specific HTML files
app.get('/resonance', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'resonance.html'));
});

app.get('/completion-log', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'completion-log.html'));
});

app.get('/forged.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'forged.html'));
});

// ---------- Forged Qbits JSON Store API ----------
const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'forged-qbits.json');

// ensure data file exists
async function ensureStore() {
  try { await fsp.mkdir(DATA_DIR, { recursive: true }); } catch {}
  try { await fsp.access(DATA_FILE); }
  catch { await fsp.writeFile(DATA_FILE, JSON.stringify([], null, 2)); }
}
async function readStore() {
  await ensureStore();
  const buf = await fsp.readFile(DATA_FILE, 'utf8');
  try { return JSON.parse(buf) || []; } catch { return []; }
}
async function writeStore(list) {
  await ensureStore();
  await fsp.writeFile(DATA_FILE, JSON.stringify(list, null, 2));
}

// normalize mission_id if caller sent only a role string
function inferMissionId(role='') {
  const r = role.toLowerCase();
  if (r.includes('harmonic')) return 'harmonic_tuning';
  if (r.includes('entangle')) return 'entanglement';
  if (r.includes('coherence') || r.includes('stitch')) return 'coherence_stitching';
  if (r.includes('absorption') || r.includes('absorb')) return 'energy_absorption';
  if (r.includes('stealth') || r.includes('mask')) return 'stealth_masking';
  return undefined;
}

// GET /api/forged-qbits - Retrieve forged Qbits with filtering
// Query params:
//   - architect_id: filter by architect (required for "Continuum" view)
//   - scope: 'continuum' (own Qbits) | 'network' (others' public) | 'all' 
//   - sort: 'newest' (default) | 'oldest' | 'trending'
//   - limit: max results (default 50)
app.get('/api/forged-qbits', async (req, res) => {
  try {
    if (!sql) {
      return res.status(503).json({ error: 'Database not available' });
    }
    
    const { architect_id, scope = 'all', sort = 'newest', limit = 50 } = req.query;
    const limitNum = Math.min(parseInt(limit) || 50, 100);
    
    let qbits = [];
    
    const safeQuery = async (query) => {
      try { return (await query) || []; } catch(e) {
        console.warn('[forged-qbits] query error, returning empty:', e.message);
        return [];
      }
    };

    if (scope === 'continuum' && architect_id) {
      qbits = await safeQuery(sql`
        SELECT id, architect_id, name, alias, mission_id, parts, fixes, boost, emblem, role, story, mechanism, recipe, visibility, view_count, created_at, origin, origin_challenge_title
        FROM forged_qbits
        WHERE architect_id = ${architect_id}
        ORDER BY created_at DESC
        LIMIT 50
      `);
    } else if (scope === 'network' && architect_id) {
      if (sort === 'trending') {
        qbits = await safeQuery(sql`
          SELECT * FROM forged_qbits 
          WHERE architect_id != ${architect_id} AND visibility = 'public'
          ORDER BY view_count DESC, created_at DESC
          LIMIT ${limitNum}
        `);
      } else {
        qbits = await safeQuery(sql`
          SELECT * FROM forged_qbits 
          WHERE architect_id != ${architect_id} AND visibility = 'public'
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `);
      }
    } else {
      if (sort === 'trending') {
        qbits = await safeQuery(sql`
          SELECT * FROM forged_qbits 
          WHERE visibility = 'public'
          ORDER BY view_count DESC, created_at DESC
          LIMIT ${limitNum}
        `);
      } else {
        qbits = await safeQuery(sql`
          SELECT * FROM forged_qbits 
          WHERE visibility = 'public'
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `);
      }
    }
    
    // ===== OUTPUT SANITIZATION =====
    // Filter out any legacy Qbits with inappropriate names/aliases
    // This catches: old prototypes, test data, pre-filter localStorage migrations
    const cleanQbits = qbits.filter(q => 
      !containsBadWord(q.name) && !containsBadWord(q.alias)
    );
    
    if (cleanQbits.length < qbits.length) {
      console.log(`[FILTER] Removed ${qbits.length - cleanQbits.length} legacy Qbits with inappropriate names from output`);
    }
    // ===== END OUTPUT SANITIZATION =====
    
    res.json(cleanQbits);
  } catch (error) {
    console.error('Error fetching forged Qbits:', error);
    res.status(500).json({ error: 'Failed to fetch forged Qbits' });
  }
});

// POST /api/forged-qbits - Save/update a forged Qbit with upsert logic
// Requires architect_id (player UUID) and mission_id
// Uses ON CONFLICT to update if same architect already has a Qbit for this mission
app.post('/api/forged-qbits', async (req, res) => {
  try {
    if (!sql) {
      return res.status(503).json({ error: 'Database not available' });
    }
    
    const { architect_id, name, alias, role, mission_id, look, parts, fixes, boost, emblem, story, mechanism, recipe, image, timestamp, visibility = 'public', origin, origin_challenge_title } = req.body;

    // Validate required fields (architect_id is now mandatory)
    if (!architect_id || !name || !role || !mission_id || !parts || !fixes || !boost) {
      return res.status(400).json({ error: 'Missing required fields (architect_id, name, role, mission_id, parts, fixes, boost)' });
    }

    // Continuum Qbits (hackathon step 7): origin is 'forged' (default, today's
    // upsert behavior) or 'continuum' (always a new row, never an update).
    // No other value — in particular no 'original' rows — is accepted.
    const saveOrigin = origin === undefined || origin === null || origin === '' ? FORGED_ORIGIN : origin;
    if (saveOrigin !== FORGED_ORIGIN && saveOrigin !== CONTINUUM_ORIGIN) {
      return res.status(400).json({ error: 'Invalid origin (must be forged or continuum)' });
    }
    let continuumTitle = null;
    if (saveOrigin === CONTINUUM_ORIGIN) {
      continuumTitle = typeof origin_challenge_title === 'string' ? origin_challenge_title.trim() : '';
      if (!continuumTitle || continuumTitle.length > 60) {
        return res.status(400).json({ error: 'origin_challenge_title (1-60 characters) required for continuum saves' });
      }
    }

    // ===== PROFANITY FILTER CHECK =====
    // Check alias and name for inappropriate content before any database operations
    if (containsBadWord(alias) || containsBadWord(name)) {
      console.log(`[FILTER] Blocked inappropriate name/alias: "${name}" / "${alias}"`);
      return res.status(400).json({
        error: 'INVALID_NAME',
        message: 'Choose a different name.'
      });
    }
    // ===== END PROFANITY CHECK =====
    
    // Check alias uniqueness: if alias provided, ensure no other architect_id owns it
    if (alias) {
      let existingAlias = [];
      try { existingAlias = (await sql`
        SELECT architect_id FROM forged_qbits 
        WHERE alias = ${alias} AND architect_id != ${architect_id}
        LIMIT 1
      `) || []; } catch(e) { existingAlias = []; }
      if (existingAlias.length > 0) {
        return res.status(409).json({ 
          error: 'Alias already taken', 
          code: 'ALIAS_CONFLICT',
          message: `The alias "${alias}" is already in use by another player. Please choose a different name.`
        });
      }
    }
    
    // Upsert: Insert or update if same architect+mission combo exists
    // Wrap in try-catch because @neondatabase/serverless throws on null RETURNING results
    let upsertResult = [];
    try {
      upsertResult = await writeQbit(sql, {
        architect_id, name, alias, role, mission_id, look, parts, fixes, boost,
        emblem, story, mechanism, recipe, image, timestamp, visibility,
        origin: saveOrigin, origin_challenge_title: continuumTitle,
      });
    } catch (upsertErr) {
      // Neon serverless throws on null results even for successful writes.
      // The INSERT still lands in the DB — log and continue with a minimal response.
      console.warn(`[Forge] Neon upsert threw (likely successful): ${upsertErr.message}`);
    }
    upsertResult = Array.isArray(upsertResult) ? upsertResult : [];

    const qbit = upsertResult[0] || { architect_id, name, alias: alias || null, role, mission_id };
    const wasInserted = qbit.was_inserted;
    delete qbit.was_inserted;
    const action = saveOrigin === CONTINUUM_ORIGIN ? 'created' : (wasInserted === false ? 'updated' : 'created');

    console.log(`[Forge] ${action.toUpperCase()} Qbit: ${name} for mission ${mission_id} by architect ${architect_id.slice(0,8)}...`);
    
    res.status(action === 'created' ? 201 : 200).json({ 
      ...qbit, 
      action 
    });
  } catch (error) {
    console.error('Error saving forged Qbit:', error);
    res.status(500).json({ error: 'Failed to save forged Qbit' });
  }
});

// POST /api/operator-id — Register or update an operator ID mapping
// Idempotent: same pair = no-op; operator_id conflict = update architect_id;
// architect_id conflict (player already has a different operator_id) = return the stored one.
app.post('/api/operator-id', async (req, res) => {
  try {
    if (!sql) return res.status(503).json({ error: 'Database not available' });
    const { operator_id, architect_id, legacy_id = null } = req.body || {};
    if (!operator_id || !architect_id) return res.status(400).json({ error: 'operator_id and architect_id required' });
    try {
      await sql`
        INSERT INTO operator_ids (operator_id, architect_id, legacy_id)
        VALUES (${operator_id}, ${architect_id}, ${legacy_id})
        ON CONFLICT (operator_id) DO UPDATE SET architect_id = EXCLUDED.architect_id
      `;
      return res.json({ ok: true, operator_id, architect_id });
    } catch (e) {
      // Unique violation on architect_id: this architect already owns a different operator_id.
      // Return the stored operator_id so the client can reconcile its localStorage.
      if (e?.code === '23505' && e?.constraint === 'operator_ids_architect_id_key') {
        let storedId = operator_id;
        try {
          const rows = await sql`SELECT operator_id FROM operator_ids WHERE architect_id = ${architect_id} LIMIT 1`;
          if (rows?.[0]?.operator_id) storedId = rows[0].operator_id;
        } catch (_) {}
        console.log(`[OperatorID] architect ${architect_id} already registered as "${storedId}", ignoring new "${operator_id}"`);
        return res.json({ ok: true, operator_id: storedId, architect_id, reconciled: true });
      }
      console.warn('[OperatorID] upsert error:', e?.message);
      return res.json({ ok: true, operator_id, architect_id });
    }
  } catch (err) {
    console.error('[OperatorID] POST error:', err.message);
    res.status(500).json({ error: 'Failed to register operator ID' });
  }
});

// POST /api/operator-id/confirm — Mark an operator ID as confirmed by the player
app.post('/api/operator-id/confirm', async (req, res) => {
  try {
    if (!sql) return res.status(503).json({ error: 'Database not available' });
    const { operator_id, architect_id } = req.body || {};
    if (!operator_id) return res.status(400).json({ error: 'operator_id required' });
    try {
      await sql`
        UPDATE operator_ids SET confirmed_at = NOW()
        WHERE operator_id = ${operator_id.toUpperCase().trim()}
        ${architect_id ? sql`AND architect_id = ${architect_id}` : sql``}
      `;
    } catch (e) { console.warn('[OperatorID] confirm update threw:', e?.message); }
    res.json({ ok: true });
  } catch (err) {
    console.error('[OperatorID] confirm error:', err.message);
    res.status(500).json({ error: 'Confirm failed' });
  }
});

// GET /api/operator-id/:id — Look up architect_id for a given operator ID
app.get('/api/operator-id/:id', async (req, res) => {
  try {
    if (!sql) return res.status(503).json({ error: 'Database not available' });
    const operatorId = (req.params.id || '').toUpperCase().trim();
    if (!operatorId) return res.status(400).json({ error: 'operator_id required' });
    let rows = [];
    try {
      rows = await sql`SELECT architect_id FROM operator_ids WHERE operator_id = ${operatorId} LIMIT 1`;
    } catch (e) { rows = []; }
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ operator_id: operatorId, architect_id: rows[0].architect_id });
  } catch (err) {
    console.error('[OperatorID] GET error:', err.message);
    res.status(500).json({ error: 'Lookup failed' });
  }
});

// POST /api/restore-migrate — Reunite pre-restore forged Qbits (hackathon step 19)
// Body: { operator_id, from_architect_id, to_architect_id }. The restore flow
// calls this once after swapping the browser id: rows forged under the
// pre-restore id move to the restored id (code must map to it, else 403),
// so /api/guide counts the same Qbits the Continuum shows.
app.post('/api/restore-migrate', async (req, res) => {
  try {
    if (!sql) return res.status(503).json({ error: 'Database not available' });
    const { operator_id, from_architect_id, to_architect_id } = req.body || {};
    try {
      const result = await migrateForgedQbits(sql, {
        operatorId: operator_id,
        fromId: from_architect_id,
        toId: to_architect_id,
      });
      console.log(`[RestoreMigrate] from=${String(from_architect_id).slice(0, 8)} to=${String(to_architect_id).slice(0, 8)} migrated=${result.migrated} dropped=${result.dropped}`);
      return res.json({ ok: true, ...result });
    } catch (e) {
      if (e && e.code === 403) return res.status(403).json({ error: 'Operator code does not own this session' });
      if (e && e.code === 400) return res.status(400).json({ error: e.message || 'Invalid restore migration' });
      throw e;
    }
  } catch (err) {
    console.error('[RestoreMigrate] error:', err.message);
    res.status(500).json({ error: 'Restore migration failed' });
  }
});

// POST /api/progress — Save unlock/points flags for an architect (hackathon step 11)
// Body: { architect_id, flags: { key: value } }. Only allowlisted progress
// keys are stored; anything else is ignored. Best-effort from clients.
app.post('/api/progress', async (req, res) => {
  try {
    if (!sql) return res.status(503).json({ error: 'Database not available' });
    const { architect_id, flags } = req.body || {};
    if (!architect_id || typeof architect_id !== 'string') {
      return res.status(400).json({ error: 'architect_id required' });
    }
    const result = await saveProgress(sql, architect_id, flags);
    return res.json({ ok: true, architect_id, saved: result.saved });
  } catch (err) {
    console.error('[Progress] POST error:', err.message);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

// GET /api/progress?architect_id=... — Read unlock/points flags (restore flow)
app.get('/api/progress', async (req, res) => {
  try {
    if (!sql) return res.status(503).json({ error: 'Database not available' });
    const architectId = req.query && req.query.architect_id;
    if (!architectId || typeof architectId !== 'string') {
      return res.status(400).json({ error: 'architect_id required' });
    }
    const result = await getProgress(sql, architectId);
    return res.json({ architect_id: architectId, flags: result.flags });
  } catch (err) {
    console.error('[Progress] GET error:', err.message);
    res.status(500).json({ error: 'Failed to read progress' });
  }
});

// POST /api/guide — The Machine guides from the Resonance hub (hackathon step 13)
// Body: { architect_id, progress: { missions }, question? }. Server-held
// values (forged Qbits, Task 11 progress flags, continuum results) always
// win over client claims; the client snapshot supplies only Forge-mission
// completions, which the server does not store. Guidance only.
const guideLimiter = guide.createRateLimiter({});
app.post('/api/guide', async (req, res) => {
  try {
    if (!sql) return res.status(503).json({ error: 'Database not available' });
    const { architect_id, progress, question } = req.body || {};
    if (!architect_id || typeof architect_id !== 'string') {
      return res.status(400).json({ error: 'architect_id required' });
    }
    const snapshot = (progress && typeof progress === 'object' && !Array.isArray(progress)) ? progress : {};
    let qbits = 0;
    try {
      const rows = await sql`SELECT COUNT(*)::int AS total FROM forged_qbits WHERE architect_id = ${architect_id}`;
      if (Array.isArray(rows) && rows[0]) qbits = Number(rows[0].total) || 0;
    } catch (e) { qbits = 0; }
    let flags = {};
    try {
      const stored = await getProgress(sql, architect_id);
      flags = (stored && stored.flags) || {};
    } catch (e) { flags = {}; }
    let attempts = 0;
    try {
      const rows = await sql`SELECT COUNT(*)::int AS total FROM continuum_results WHERE architect_id = ${architect_id}`;
      if (Array.isArray(rows) && rows[0]) attempts = Number(rows[0].total) || 0;
    } catch (e) { attempts = 0; }
    const restored = guide.GUARDIANS.filter((g) => flags[`${g}.v3.complete`] === 'true');
    const points = Number(flags['quantum.global.points']);
    const merged = guide.mergeProgress({
      server: {
        restored,
        forgeAvailable: Number.isFinite(points) && points >= 12,
        qbits,
        continuumAttempts: attempts,
      },
      client: { missions: snapshot.missions },
    });
    const hasKey = !!process.env.MODEL_API_KEY;
    const out = await guide.answerGuide({
      architectId: architect_id,
      merged,
      question: typeof question === 'string' ? question : '',
      limiter: guideLimiter,
      chatFn: hasKey ? (messages) => chat(messages, { maxTokens: guide.GUIDE_MAX_TOKENS }) : null,
    });
    console.log(`[Guide] architect=${String(architect_id).slice(0, 8)} stage=${out.stage} source=${out.source} qbits=${qbits}`);
    return res.json(out);
  } catch (err) {
    console.error('[Guide] error:', err.message);
    res.status(500).json({ error: 'Guide failed' });
  }
});

// GET /api/check-alias - Check if an alias is available
// Returns { available: true/false, message: string }
app.get('/api/check-alias', async (req, res) => {
  try {
    if (!sql) {
      return res.status(503).json({ error: 'Database not available' });
    }
    
    const { alias, architect_id } = req.query;
    
    if (!alias || alias.trim().length === 0) {
      return res.json({ available: false, message: 'Alias is required' });
    }
    
    const trimmedAlias = alias.trim();
    
    // Check length
    if (trimmedAlias.length < 2 || trimmedAlias.length > 20) {
      return res.json({ available: false, message: 'Alias must be 2-20 characters' });
    }
    
    // Check if alias is taken by someone else
    const existing = await sql`
      SELECT architect_id FROM forged_qbits 
      WHERE LOWER(alias) = LOWER(${trimmedAlias})
      LIMIT 1
    `;
    
    if (existing.length > 0) {
      // If architect_id provided, check if it's theirs
      if (architect_id && existing[0].architect_id === architect_id) {
        return res.json({ available: true, message: 'This is your current alias' });
      }
      return res.json({ available: false, message: 'This codename is already taken by another operator' });
    }
    
    return res.json({ available: true, message: 'Codename available!' });
  } catch (error) {
    console.error('Error checking alias:', error);
    res.status(500).json({ error: 'Failed to check alias' });
  }
});

// POST /api/forged-qbits/:id/view - Increment view count for a Qbit
app.post('/api/forged-qbits/:id/view', async (req, res) => {
  try {
    if (!sql) {
      return res.status(503).json({ error: 'Database not available' });
    }
    
    const { id } = req.params;
    
    // Increment view count using raw SQL for atomic operation
    const rows = await sql`
      UPDATE forged_qbits 
      SET view_count = COALESCE(view_count, 0) + 1 
      WHERE id = ${parseInt(id)} 
      RETURNING id, view_count
    `;
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Qbit not found' });
    }
    
    res.json({ id: rows[0].id, viewCount: rows[0].view_count });
  } catch (error) {
    console.error('Error incrementing view count:', error);
    res.status(500).json({ error: 'Failed to update view count' });
  }
});

// GET /api/network-stats - Get network statistics for Continuum Tactical
app.get('/api/network-stats', async (req, res) => {
  try {
    if (!sql) {
      return res.status(503).json({ error: 'Database not available' });
    }
    
    // Get total public Qbits and unique players
    const stats = await sql`
      SELECT 
        COUNT(*) as total_qbits,
        COUNT(DISTINCT architect_id) as total_players
      FROM forged_qbits 
      WHERE visibility = 'public'
    `;
    
    res.json({
      qbits: parseInt(stats[0]?.total_qbits || 0),
      players: parseInt(stats[0]?.total_players || 0)
    });
  } catch (error) {
    console.error('Error fetching network stats:', error);
    res.status(500).json({ error: 'Failed to fetch network stats', qbits: 0, players: 0 });
  }
});

// PUT and DELETE endpoints not needed for now
// Forged Qbits are append-only for multiplayer compatibility

// ── Meta Forge Probe ──────────────────────────────────────────────────────
app.post('/api/forge-probe', async (req, res) => {
  try {
    const {
      mission_id, mission_name, attempt_number,
      validation_issue, selected_parts, selected_fixes,
      selected_boost, recent_selections, mechanism,
      prompt_type, player_question, test_result
    } = req.body;

    const isMachineQuery = prompt_type === 'machine_query';

    if (!process.env.MODEL_API_KEY) {
      return res.json({ probe: 'What did you notice when you tried that?', source: 'dev-fallback' });
    }

    const _fpOperatorId = req.body.operator_id || '';
    // Machine queries (hackathon step 10) are answered from the player's
    // actual build via machineProbe (server/machine-context.js). The
    // Socratic probe below is unchanged.
    const systemPrompt = isMachineQuery
      ? null
      : buildWorldBrief(_fpOperatorId) + `

---
Additional rules for this chamber probe:
- There are three valid solutions for every mission. Never imply there is one right answer.
- Ask about the relationship between the player's chosen parts and the mission goal.
- Reference their VoicePicker mechanism if provided.
- Never give the correct answer or name any component.
- Never tell the learner they are right, wrong, close, or on the right track.
- Never give explanations or hints that solve the problem.
- Never be overly encouraging.
- Ask exactly ONE sharp, concise question (maximum 25 words).
- Always base your question on the learner's own mechanism description.
- Hold superposition open. Create productive tension.
- If no components are listed, ask a generic question about the mission goal. Never invent component names.
- If a target_part_name is supplied, refer to it by that exact name. Never call it Part 1, Part 2, Part 3, slot, or component.
- Respond with ONLY the question. No extra text.`;

    const mechanism_desc = mechanism || 'not yet described';
    const userPrompt = isMachineQuery
      ? null
      : `The learner has described their Qbit mechanism as:
"${mechanism_desc}"

Recent components selected: ${(selected_parts || []).join(', ') || 'none'}
Current validation issue: ${validation_issue || 'none'}
Attempt number: ${attempt_number}

Ask one precise probing question that forces them to examine the strength or weakness of their own mechanism. Reference their exact words when possible.`;

    // Meta (Muse Spark is a reasoning model): 500 output tokens leave
    // headroom for internal reasoning; the prompt above keeps the reply short.
    let probe;
    try {
      probe = isMachineQuery
        ? await machineProbe({
            missionId: mission_id,
            missionName: mission_name,
            parts: selected_parts,
            fixes: selected_fixes,
            boost: selected_boost,
            testResult: test_result,
            question: player_question,
          })
        : await chat(
            [
              { role: 'system', content: systemPrompt },
              { role: 'user',   content: userPrompt }
            ],
            { maxTokens: 500 }
          );
    } catch (chatErr) {
      if (String((chatErr && chatErr.message) || '').startsWith('empty_model_response')) {
        probe = 'What did the chamber teach you about how signals behave?';
      } else {
        throw chatErr;
      }
    }

    console.log(`[ForgeProbe] mission=${mission_id} attempt=${attempt_number} probe="${probe}"`);
    return res.json({ probe });

  } catch (err) {
    console.warn('[ForgeProbe] Error:', err.message);
    return res.json({ probe: 'What happened when you used that fix in the chamber?' });
  }
});

// ── Chamber Probe (lore-injected, per-Qbit) ───────────────────────────────
app.post('/api/chamber-probe', async (req, res) => {
  try {
    const {
      architect_id, session_id, chamber, qbit_name,
      attempted_fix, attempt_number, voice_transcript,
      prompt_type, mic_used, result,
      dropped_into_slot, correct_mod_for_slot,
      target_part_name, attempted_mod, correct_mod
    } = req.body || {};
    const _partName = target_part_name || dropped_into_slot || 'this slot';
    const _attemptedMod = attempted_mod || attempted_fix || 'unknown';
    const _correctMod = correct_mod || correct_mod_for_slot || 'a different fix';
    const _transcript = typeof voice_transcript === 'string' ? voice_transcript.trim() : '';

    if (!process.env.MODEL_API_KEY) {
      return res.json({ probe: 'What did you notice when you tried that?', source: 'dev-fallback' });
    }

    const qbitKey = MISSION_TO_QBIT[chamber] || (chamber || '').toLowerCase().replace(/\s+/g, '_');
    const qbitData = QBIT_LORE[qbitKey] || {};

    // Typed follow-up (hackathon step 9): the player asked a real question
    // after the first hint. Answer it in the Guardian's voice (max 2
    // sentences, Socratic, never naming the correct mod; off-topic nudged
    // back to the repair). Retries once, then falls back to player-safe text.
    let probe;
    if (_transcript) {
      probe = await followupProbe({
        chamber,
        qbitName: qbit_name || chamber,
        partName: _partName,
        attemptedMod: _attemptedMod,
        correctMod: _correctMod,
        transcript: _transcript,
        machineJob: qbitData.machine_job || '',
      });
    } else {
    const systemPrompt = qbitData.machine_job
      ? `Fix definitions:
SH: holds all paths open
F::: nudges waves into sync
C//: locks one result

Player dropped ${_attemptedMod} into ${_partName}. ${_partName} needs ${_correctMod}.

Reply in exactly 3 lines. Max 35 words total.
Line 1: State in plain language what ${_attemptedMod} does.
Line 2: State in plain language what ${_partName} needs.
Line 3: Ask one short question pointing to the correct principle. Do not name the correct mod symbol.

Rules:
- Refer to the target part by its exact supplied name ("${_partName}"). Never call it Part 1, Part 2, Part 3, slot, or component.
- No em dashes
- No decorative words: no hums, flickers, spatters, narration
- No metaphors longer than 4 words
- Plain language only
- Do not reveal the correct mod symbol or the answer`
      : `You are a Socratic guide for the ${chamber} chamber. Ask one sharp question (max 25 words) about why "${attempted_fix}" did not work. Never give the answer.`;

    // Meta (Muse Spark is a reasoning model): 500 output tokens leave
    // headroom for internal reasoning; the prompt above keeps the reply short.
    // (First probe only: typed follow-ups take the Guardian-voice branch above.)
    try {
      probe = (await chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `I tried ${attempted_fix || 'something'} and it didn't work.` }
        ],
        { maxTokens: 500 }
      )).replace(/\*+/g, '');
    } catch (chatErr) {
      if (String((chatErr && chatErr.message) || '').startsWith('empty_model_response')) {
        probe = 'What did you observe when you tried that?';
      } else {
        throw chatErr;
      }
    }
    }

    console.log(`[ChamberProbe] chamber=${chamber} attempt=${attempt_number} mic=${!!voice_transcript} probe="${probe}"`);

    // NOTE: probe_shown is intentionally NOT logged here. The client already logs
    // probe_shown exactly once, at the moment the probe UI is triggered
    // (see _logProbeEvent(..., 'probe_shown', ...) in public/chambers/*.js).
    // This endpoint is called once for that initial request AND again for every
    // retry submission, so inserting probe_shown here caused it to fire once per
    // retry in addition to the client's single correct fire.
    if (sql && architect_id) {
      if (voice_transcript) {
        const voiceProps = JSON.stringify({
          session_id: session_id || null, chamber, qbit: qbit_name,
          attempted_fix, attempt_number, transcript: voice_transcript, prompt_type: prompt_type || 'voice_response'
        });
        sql`INSERT INTO events (architect_id, event_name, event_type, properties, created_at) VALUES (${architect_id}, 'voice_capture', 'voice_capture', ${voiceProps}::jsonb, NOW())`
          .catch(e => console.warn('[ChamberProbe] voice_capture log failed:', e.message));
      }
    }

    return res.json({ probe });
  } catch (err) {
    console.warn('[ChamberProbe] Error:', err.message);
    return res.json({ probe: 'What did you notice when you tried that?' });
  }
});

// ── Forge Companion Probe (progressive disclosure) ────────────────────────
app.post('/api/forge-companion/probe', async (req, res) => {
  try {
    const {
      architect_id, mission_id, mission_name, attempt_number,
      selected_parts, selected_fixes, selected_boost,
      voicepicker_mechanism
    } = req.body;

    if (!process.env.MODEL_API_KEY) {
      return res.json({ probe: 'What did you notice when you tried that?', source: 'dev-fallback' });
    }

    let _fcOperatorId = req.body.operator_id || '';
    if (!_fcOperatorId && architect_id && sql) {
      try {
        const _rows = await sql`SELECT operator_id FROM operator_ids WHERE architect_id = ${architect_id} LIMIT 1`;
        _fcOperatorId = _rows[0]?.operator_id || '';
      } catch (_) {}
    }
    const systemPrompt = buildWorldBrief(_fcOperatorId) + `

---
Additional rules for this Forge companion probe:
- The player just completed chambers where they learned: SH = hold multiple paths open, F:: = nudge into sync, C// = lock the final result.
- Every Forge component comes from one of those chambers.
- When the player validates a build, identify which role (splitter, aligner, or locker) is missing or weak.
- Ask one short concrete question referencing a specific component they picked and what it did in its original chamber.
- Never be vague. Never give the full answer.`;

    const _cn = s => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const _cl = arr => (arr || []).map(_cn).join(', ') || 'none';

    const mechanism_desc = voicepicker_mechanism || 'not yet described';
    const userPrompt = `Mission: ${mission_name}
Player's chosen parts: ${_cl(selected_parts)}
Fixes chosen: ${_cl(selected_fixes)}
Boost chosen: ${selected_boost ? _cn(selected_boost) : 'none'}
VoicePicker mechanism: "${mechanism_desc}"
Attempt number: ${attempt_number}

Ask one precise Socratic question that forces them to examine the relationship between their chosen parts and the mission goal.`;

    // Meta (Muse Spark is a reasoning model): 500 output tokens leave
    // headroom for internal reasoning; the prompt above keeps the reply short.
    let probe;
    try {
      probe = await chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt }
        ],
        { maxTokens: 500 }
      );
    } catch (chatErr) {
      if (String((chatErr && chatErr.message) || '').startsWith('empty_model_response')) {
        probe = 'What connects the parts you chose to what the mission actually needs?';
      } else {
        throw chatErr;
      }
    }

    console.log(`[ForgeCompanion] mission=${mission_id} attempt=${attempt_number} probe="${probe}"`);
    return res.json({ probe });

  } catch (err) {
    console.warn('[ForgeCompanion] Error:', err.message);
    return res.json({ probe: 'What happened when you used that component in the chamber?' });
  }
});

// ── Machine Hint (Ask the Machine button) ─────────────────────────────────
app.post('/api/machine-hint', async (req, res) => {
  const FALLBACK = 'What did you notice when you tried that?';
  try {
    const { player_question, system_instructions, conversation_history, architect_id } = req.body;

    if (!process.env.MODEL_API_KEY) return res.json({ hint: FALLBACK });

    if (!player_question) return res.json({ hint: FALLBACK });

    const history = Array.isArray(conversation_history) ? conversation_history : [];

    const messages = [
      { role: 'system', content: system_instructions || 'You are a helpful engineering mentor.' },
      ...history,
      { role: 'user', content: player_question }
    ];

    // Meta (Muse Spark is a reasoning model): 600 output tokens leave
    // headroom for internal reasoning; the instructions keep the reply short.
    // Empty and error outcomes both reach FALLBACK via the catch below.
    const hint = stripEmDash(await chat(messages, { maxTokens: 600 }));
    console.log(`[MachineHint] question="${player_question.slice(0,60)}" hint="${hint.slice(0,80)}"`);

    if (sql && architect_id) setImmediate(async () => {
      try {
        await sql`
          INSERT INTO events (id, architect_id, event_type, event_name, detail, timestamp)
          VALUES (gen_random_uuid(), ${architect_id}, 'machine_hint_requested', 'machine_hint_requested', ${JSON.stringify({ question_length: player_question.length, history_turns: history.length, response_length: hint.split(/\s+/).filter(Boolean).length })}::jsonb, NOW())
        `;
      } catch (e) { console.warn('[MachineHint] Analytics error:', e.message); }
    });

    return res.json({ hint });

  } catch (err) {
    console.warn('[MachineHint] Error:', err.message);
    return res.json({ hint: FALLBACK });
  }
});

// ── Session Log ───────────────────────────────────────────────────────────
app.post('/api/session-log', async (req, res) => {
  try {
    if (!sql) {
      return res.json({ ok: true, stored: 'local_only' });
    }

    const {
      session_id, learner_id, mission_id,
      started_at, ended_at,
      component_sequence, dwell_times,
      validation_attempts, probe_history,
      final_build, session_outcome,
      revision_count, total_resistance_ms, friction_score
    } = req.body;

    if (!session_id || !learner_id || !mission_id) {
      return res.status(400).json({ error: 'session_id, learner_id, mission_id required' });
    }

    await sql`
      INSERT INTO forge_sessions (
        session_id, learner_id, mission_id,
        started_at, ended_at,
        component_sequence, dwell_times,
        validation_attempts, probe_history,
        final_build, session_outcome,
        revision_count, total_resistance_ms, friction_score
      ) VALUES (
        ${session_id}, ${learner_id}, ${mission_id},
        ${started_at || new Date().toISOString()},
        ${ended_at   || new Date().toISOString()},
        ${JSON.stringify(component_sequence  || [])}::jsonb,
        ${JSON.stringify(dwell_times         || {})}::jsonb,
        ${JSON.stringify(validation_attempts || [])}::jsonb,
        ${JSON.stringify(probe_history       || [])}::jsonb,
        ${JSON.stringify(final_build         || {})}::jsonb,
        ${session_outcome     || 'in_progress'},
        ${revision_count      || 0},
        ${total_resistance_ms || 0},
        ${friction_score      || 0}
      )
      ON CONFLICT (session_id) DO UPDATE SET
        ended_at            = EXCLUDED.ended_at,
        component_sequence  = EXCLUDED.component_sequence,
        dwell_times         = EXCLUDED.dwell_times,
        validation_attempts = EXCLUDED.validation_attempts,
        probe_history       = EXCLUDED.probe_history,
        final_build         = EXCLUDED.final_build,
        session_outcome     = EXCLUDED.session_outcome,
        revision_count      = EXCLUDED.revision_count,
        total_resistance_ms = EXCLUDED.total_resistance_ms,
        friction_score      = EXCLUDED.friction_score
    `;

    console.log(`[SessionLog] Saved: ${session_id.slice(0,8)}... friction=${friction_score}`);
    return res.json({ ok: true, session_id });

  } catch (err) {
    console.error('[SessionLog] Error:', err.message);
    return res.json({ ok: true, error: err.message, stored: false });
  }
});

// GET /api/traffic-stats - Get traffic analysis from request logs
app.get('/api/traffic-stats', async (req, res) => {
  try {
    if (!sql) {
      return res.status(503).json({ error: 'Database not available' });
    }
    
    const { days = 7 } = req.query;
    const daysNum = Math.min(parseInt(days) || 7, 30);
    
    // Summary stats
    const summary = await sql`
      SELECT 
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE is_bot = false) as human_requests,
        COUNT(*) FILTER (WHERE is_bot = true) as bot_requests,
        COUNT(DISTINCT ip_hash) as unique_ips,
        COUNT(DISTINCT ip_hash) FILTER (WHERE is_bot = false) as unique_humans
      FROM request_log 
      WHERE timestamp > NOW() - INTERVAL '${daysNum} days'
    `;
    
    // By day
    const byDay = await sql`
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_bot = false) as humans,
        COUNT(*) FILTER (WHERE is_bot = true) as bots
      FROM request_log 
      WHERE timestamp > NOW() - INTERVAL '${daysNum} days'
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `;
    
    // Top paths (non-bot)
    const topPaths = await sql`
      SELECT path, COUNT(*) as hits
      FROM request_log 
      WHERE is_bot = false AND timestamp > NOW() - INTERVAL '${daysNum} days'
      GROUP BY path
      ORDER BY hits DESC
      LIMIT 20
    `;
    
    // Top referrers
    const topReferrers = await sql`
      SELECT referrer, COUNT(*) as hits
      FROM request_log 
      WHERE referrer IS NOT NULL AND referrer != '' AND timestamp > NOW() - INTERVAL '${daysNum} days'
      GROUP BY referrer
      ORDER BY hits DESC
      LIMIT 15
    `;
    
    // Bot breakdown
    const botBreakdown = await sql`
      SELECT 
        CASE 
          WHEN user_agent ILIKE '%googlebot%' THEN 'Googlebot'
          WHEN user_agent ILIKE '%bingbot%' THEN 'Bingbot'
          WHEN user_agent ILIKE '%duckduckbot%' THEN 'DuckDuckBot'
          WHEN user_agent ILIKE '%yandex%' THEN 'Yandex'
          WHEN user_agent ILIKE '%ahrefsbot%' THEN 'Ahrefs'
          WHEN user_agent ILIKE '%semrushbot%' THEN 'SEMrush'
          WHEN user_agent ILIKE '%python%' THEN 'Python script'
          WHEN user_agent ILIKE '%curl%' THEN 'curl'
          ELSE 'Other bot'
        END as bot_type,
        COUNT(*) as hits
      FROM request_log 
      WHERE is_bot = true AND timestamp > NOW() - INTERVAL '${daysNum} days'
      GROUP BY bot_type
      ORDER BY hits DESC
    `;
    
    res.json({
      period: `Last ${daysNum} days`,
      summary: summary[0] || {},
      byDay,
      topPaths,
      topReferrers,
      botBreakdown
    });
  } catch (error) {
    console.error('Error fetching traffic stats:', error);
    res.status(500).json({ error: 'Failed to fetch traffic stats' });
  }
});

// ---------- OpenAI v5 client ----------
let client = null;
try {
  let OpenAI = require('openai');
  OpenAI = OpenAI.OpenAI || OpenAI.default || OpenAI;
  if (process.env.OPENAI_API_KEY) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('✅ OpenAI client ready (v5)');
  } else {
    console.warn('⚠️ OPENAI_API_KEY not set — using stub replies');
  }
} catch (e) {
  console.warn('⚠️ "openai" package not installed or failed to load:', e?.message);
}

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o';
const RAG_STRONG_THRESHOLD = parseInt(process.env.RAG_STRONG_THRESHOLD || '2', 10);
const FORCE_GPT = String(process.env.FORCE_GPT || '').toLowerCase() === 'true';

// ---------- Mini-RAG CSV ----------
let csv;
try { csv = require('csv-parser'); } catch (_) {}

const RAG_ROWS = [];
const CSV_PATH = path.join(__dirname, 'public', 'data', 'dialog.csv');

if (csv && fs.existsSync(CSV_PATH)) {
  fs.createReadStream(CSV_PATH)
    .pipe(csv())
    .on('data', row => RAG_ROWS.push(row))
    .on('end', () => console.log(`✅ Mini-RAG loaded: ${RAG_ROWS.length} rows from ${path.basename(CSV_PATH)}`));
} else {
  console.log('ℹ️ CSV mini-RAG not loaded (missing file or csv-parser).');
}

// ---------- Qbit lore ----------
let QBIT_LORE = {};
const MISSION_TO_QBIT = {
  refrax: 'refrax', magnetica: 'magnetica', chrona: 'chrona',
  violetflicker: 'violet_flicker', harmonic_tuning: 'harmonic_tuning',
  entanglement: 'entanglement', coherence_stitching: 'coherence_stitching',
  energy_absorption: 'energy_absorption', stealth_masking: 'stealth_masking'
};

(function loadQbitLore() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'public', 'data', 'guardian-lore.csv'), 'utf8');
    const lines = raw.trim().split('\n');
    const headers = parseCSVLine(lines[0]);
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const vals = parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
      const key = row.qbit_name.toLowerCase().replace(/\s+/g, '_');
      QBIT_LORE[key] = row;
    }
    console.log('[Lore] Loaded', Object.keys(QBIT_LORE).length, 'Qbit profiles');
  } catch (e) {
    console.warn('[Lore] Qbit lore not loaded:', e.message);
  }
})();

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQ = !inQ; }
    else if (line[i] === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += line[i]; }
  }
  result.push(cur);
  return result;
}

// ---------- Personas + property one-liners ----------
const PERSONA = {
  refrax:        "reflective, optics, mirrors, superposition",
  magnetica:     "spin, polarity, magnetic fields",
  twinsong:      "resonance, harmony, entanglement",
  violetflicker: "plasma, sparks, arcs",
  entropica:     "entanglement, remote links",
  novaloom:      "weaving coherence, pattern, phase anchors",
  nullia:        "vacuum ground, stillness",
  echodrop:      "cloaking, masking, stealth echoes",
  chrona:        "phase/time, loops and ticks"
};

const PROPERTY = {
  refrax:        "Splits and recombines light: superposition → phase shift → interference decides the result.",
  magnetica:     "Tunes spin and frequency with magnetic flux so signals flip or align on command.",
  twinsong:      "Locks separate tones into harmony via entanglement and phase alignment.",
  violetflicker: "Ionizes air into plasma—sparks that wake circuits and obey fine phase timing.",
  entropica:     "Links distant states (entanglement) and routes noise away so signals stay clean.",
  novaloom:      "Weaves phase across threads—phase gates reveal hidden patterns and phase lock holds them.",
  nullia:        "Provides perfect ground: a quiet vacuum sink that stabilizes everything around it.",
  echodrop:      "Masks and reroutes energy (tunneling/ghost paths) and uses spin/polarity to cancel echoes.",
  chrona:        "Keeps perfect time—phase locks cycles and syncs distant clocks to the same beat."
};

// ---------- Fixed CTA shown on chamber entry ----------
const CHAMBER_CTA = `Your attention to invention opened an ancient quantum chamber that's offline—make the fixes to awaken it.`;

// ---------- RAG matcher (returns {row, score, matchedQuestion} | null) ----------
function escapeReg(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function pickRagByCategory(qbit, message) {
  if (!RAG_ROWS.length) return null;
  const msg = String(message || '').toLowerCase().trim();

  // Conceptual question mapping (handles "why am I here" -> "what is this game")
  const conceptMap = {
    'why am i here': 'what is this game',
    'what am i doing': 'what is this game',
    'what is the point': 'what is this game',
    'whats the goal': 'what is this game',
    'what do i do': 'what is this game',
    'what is quantum': 'what do you mean',
    'what is superposition': 'what is superposition',
    'what is interference': 'what is interference',
    'what is entanglement': 'what is entanglement'
  };
  
  let searchMsg = msg;
  for (const [concept, canonical] of Object.entries(conceptMap)) {
    if (msg.includes(concept)) {
      searchMsg = canonical;
      break;
    }
  }

  // Filter rows by QBIT column (note: CSV has "QBIT" not "qbit")
  const pool = RAG_ROWS.filter(r => {
    const qb = String(r.QBIT || '').toLowerCase().trim();
    const targetQbit = String(qbit).toLowerCase().trim();
    
    // Handle "Violet Flicker" vs "violetflicker" mismatch
    const normalizedQb = qb.replace(/\s+/g, '').toLowerCase();
    const normalizedTarget = targetQbit.replace(/\s+/g, '').toLowerCase();
    
    return normalizedQb === normalizedTarget;
  });

  if (!pool.length) {
    console.log(`[RAG] No rows found for qbit: ${qbit}`);
    return null;
  }

  // Match against BOTH kid_question AND kid_followup columns
  let best = null, bestScore = 0, matchedQuestion = '';
  for (const r of pool) {
    const question = String(r.kid_question || '').toLowerCase().trim();
    const followup = String(r.kid_followup || '').toLowerCase().trim();
    
    // Try matching against both questions
    for (const [q, type] of [[question, 'main'], [followup, 'followup']]) {
      if (!q) continue;
      
      // Calculate similarity score
      let score = 0;
      
      // Exact match gets highest score
      if (searchMsg === q || msg === q) {
        score = 100;
      } 
      // Check if message contains the question or vice versa
      else if (searchMsg.includes(q) || q.includes(searchMsg) || msg.includes(q) || q.includes(msg)) {
        score = 50;
      }
      // Word-by-word matching
      else {
        const msgWords = searchMsg.split(/\s+/).filter(w => w.length > 2);
        const qWords = q.split(/\s+/).filter(w => w.length > 2);
        for (const mw of msgWords) {
          for (const qw of qWords) {
            if (mw === qw) score += 5;
          }
        }
      }
      
      if (score > bestScore) { 
        best = r; 
        bestScore = score;
        matchedQuestion = type;
      }
    }
  }
  
  if (bestScore > 0) {
    const displayQ = matchedQuestion === 'followup' ? best.kid_followup : best.kid_question;
    console.log(`[RAG] Match found: "${displayQ}" (score: ${bestScore}, type: ${matchedQuestion})`);
  }
  
  return bestScore > 0 ? { row: best, score: bestScore, matchedQuestion } : null;
}

// ---------- Session storage for keyword tracking ----------
const sessionKeywords = {};
const sessionLastQuestion = {};
const sessionLastRow = {};
const sessionFailedAttempts = {}; // Track consecutive failed attempts

// ---------- "How" question detector ----------
function isHowQuestion(text='') {
  const t = String(text).toLowerCase().trim();
  // Match ONLY short follow-ups: "how", "how?", "how??", "how do i?", "how do i do it?"
  // Do NOT match full questions like "How do I win the game?"
  return /^how[?!]*$|^how do i[?!]*$|^how do i do it[?!]*$/i.test(t);
}

// ---------- Intent detector ----------
function detectIntent(text='') {
  const t = String(text).toLowerCase();
  const asksProperty = /\b(what|how)\b.*\b(property|do you do|ability|power|work|special)\b|\bwhat is it\b/.test(t);
  const wantsRecipe  = /\bparts?\b|\bsteps?\b|\bbuild recipe\b|(?:^|\s)(1\.|2\.|3\.)/.test(t);
  const givesRecipe  = /(^|\n)\s*(parts|materials)\s*:|(^|\n)\s*steps\s*:|(^|\n)\s*1\./i.test(text);
  const asksHelp     = /\b(i don'?t know|idk|help|not sure|can you help)\b/.test(t);
  return { asksProperty, wantsRecipe, givesRecipe, asksHelp };
}

// ---------- Routes ----------
app.get('/health', (_, res) => res.json({ ok: true, force_gpt: FORCE_GPT }));
app.get('/',   (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/intro.html', (_, res) => res.sendFile(path.join(__dirname, 'intro.html')));
app.get('/about.html', (_, res) => res.sendFile(path.join(__dirname, 'about.html')));

app.post('/query', async (req, res) => {
  const { message = '', qbit = 'refrax', stage = 'afterVideo', sessionId = 'default' } = req.body || {};

  // PUBLIC BUILD MODE: CSV-only responses (no OpenAI calls)
  
  // Handle initial greeting (afterVideo stage with empty message)
  if (stage === 'afterVideo') {
    // Look for intro greeting row for this qbit
    const introRow = RAG_ROWS.find(r => {
      const qb = String(r.QBIT || '').toLowerCase().replace(/\s+/g, '');
      const target = String(qbit).toLowerCase().replace(/\s+/g, '');
      const rowStage = String(r.stage || '').trim();
      return qb === target && rowStage === 'afterVideo';
    });
    
    const reply = introRow ? String(introRow.qbit_response || 'What do you want to know?').trim() : 'What do you want to know?';
    return res.json({ reply, stage: '1' });
  }

  // Normalize message for matching
  const msg = String(message || '').toLowerCase().trim();
  
  // Filter rows by QBIT only (not by stage - kids can ask any question at any time)
  const qbitRows = RAG_ROWS.filter(r => {
    const qb = String(r.QBIT || '').toLowerCase().replace(/\s+/g, '');
    const target = String(qbit).toLowerCase().replace(/\s+/g, '');
    return qb === target;
  });

  // Check if this is a "how" follow-up question
  const isHow = isHowQuestion(message);
  let matchedRow = null;
  let matchScore = 0;
  
  if (isHow && sessionLastRow[sessionId]) {
    // FIRST: Check if the last matched row has a built-in followup
    const lastRow = sessionLastRow[sessionId];
    const hasFollowup = lastRow && String(lastRow.qbit_followup || '').trim();
    
    if (hasFollowup) {
      // Use the same row's followup
      matchedRow = lastRow;
      matchScore = 90; // Very high score for same-row followup
      console.log(`[HOW] Using same-row followup for "${lastRow.kid_question}"`);
    } else if (sessionKeywords[sessionId]) {
      // FALLBACK: Use keyword-based matching for "how" questions
      const lastKeywords = sessionKeywords[sessionId].split('|').map(k => k.trim().toLowerCase());
      const lastQuestion = String(sessionLastQuestion[sessionId] || '').toLowerCase();
      console.log(`[HOW] Searching for keywords: ${lastKeywords.join(', ')}`);
      
      // Look through all rows for this qbit and find one whose kid_question or qbit_response contains any keyword
      // BUT exclude the last question to avoid repeating the same answer
      for (const row of qbitRows) {
        const question = String(row.kid_question || '').toLowerCase();
        const response = String(row.qbit_response || '').toLowerCase();
        
        // Skip if this is the same question we just answered
        if (question === lastQuestion) {
          continue;
        }
        
        // Check if any keyword appears in kid_question or qbit_response text
        for (const keyword of lastKeywords) {
          if (question.includes(keyword) || response.includes(keyword)) {
            matchedRow = row;
            matchScore = 75; // High score for keyword match
            const location = question.includes(keyword) ? 'question' : 'response';
            console.log(`[HOW] Keyword match found: "${keyword}" in ${location}: "${row.kid_question}" (excluded last: "${lastQuestion}")`);
            break;
          }
        }
        
        if (matchedRow) break;
      }
    }
  }
  
  // If not a "how" question, or no keyword match found, do normal matching
  if (!matchedRow) {
    for (const row of qbitRows) {
      const question = String(row.kid_question || '').toLowerCase().trim();
      const followup = String(row.kid_followup || '').toLowerCase().trim();
      
      if (!question && !followup) continue;
      
      // Check for exact or substring matches
      let score = 0;
      
      // Try matching against kid_question
      if (question) {
        if (msg === question) score = 100; // Exact match
        else if (msg.includes(question) || question.includes(msg)) score = 50;
        else {
          // Word-by-word matching
          const msgWords = msg.split(/\s+/).filter(w => w.length > 2);
          const qWords = question.split(/\s+/).filter(w => w.length > 2);
          for (const mw of msgWords) {
            for (const qw of qWords) {
              if (mw === qw) score += 10;
            }
          }
        }
      }
      
      // Try matching against kid_followup
      if (followup && score < 50) {
        let followupScore = 0;
        if (msg === followup) followupScore = 100;
        else if (msg.includes(followup) || followup.includes(msg)) followupScore = 50;
        else {
          const msgWords = msg.split(/\s+/).filter(w => w.length > 2);
          const fWords = followup.split(/\s+/).filter(w => w.length > 2);
          for (const mw of msgWords) {
            for (const fw of fWords) {
              if (mw === fw) followupScore += 10;
            }
          }
        }
        score = Math.max(score, followupScore);
      }
      
      if (score > matchScore) {
        matchScore = score;
        matchedRow = row;
      }
    }
  }

  // If no match found at stage 3, kick to chamber anyway
  if (stage === '3' && (!matchedRow || matchScore === 0)) {
    console.log(`[CSV] Stage 3: No match found, but kicking to chamber anyway for qbit=${qbit} message="${message}"`);
    sessionFailedAttempts[sessionId] = 0; // Reset counter
    return res.json({ 
      reply: "Your attention to invention opened an ancient chamber.",
      stage: 'chamber'
    });
  }
  
  // If no match found at other stages, check failed attempts
  if (!matchedRow || matchScore === 0) {
    // Increment failed attempts counter
    sessionFailedAttempts[sessionId] = (sessionFailedAttempts[sessionId] || 0) + 1;
    console.log(`[CSV] No match found for qbit=${qbit} message="${message}" (failed attempts: ${sessionFailedAttempts[sessionId]})`);
    
    // After 2 failed attempts, kick to chamber as safety mechanism
    if (sessionFailedAttempts[sessionId] >= 2) {
      console.log(`[SAFETY] 2 failed attempts - kicking to chamber`);
      sessionFailedAttempts[sessionId] = 0; // Reset counter
      return res.json({ 
        reply: "Your attention to invention opened an ancient chamber.",
        stage: 'chamber'
      });
    }
    
    // First failed attempt - give them another chance
    return res.json({ 
      reply: "Repeat your question, please. I'm still learning how to talk to humans.",
      stage: stage // Keep same stage on fallback
    });
  }

  // We have a match! Now use stage to determine which column to return
  let replyText = '';
  let nextStage = stage;
  
  if (stage === '1') {
    // Stage 1: return qbit_response, advance to stage 2
    replyText = String(matchedRow.qbit_response || '').trim();
    nextStage = '2';
  } else if (stage === '2') {
    // Stage 2: return qbit_followup, advance to stage 3
    replyText = String(matchedRow.qbit_followup || matchedRow.qbit_response || '').trim();
    nextStage = '3';
  } else if (stage === '3') {
    // Stage 3: chamber transition message (kick out after 3 questions / 2 answers)
    replyText = "Your attention to invention opened an ancient chamber.";
    nextStage = 'chamber';
  } else if (stage === 'chamber') {
    // Already at chamber stage, keep them there
    replyText = String(matchedRow.qbit_response || '').trim();
    nextStage = 'chamber';
  }

  // Fallback if reply is empty
  if (!replyText) {
    replyText = "Repeat your question, please. I'm still learning how to talk to humans.";
    nextStage = stage; // Don't advance on error
  } else {
    // Successful match - reset failed attempts counter
    sessionFailedAttempts[sessionId] = 0;
    
    // Save keywords, last question, and last row from this match for potential "how" follow-ups
    const keywords = String(matchedRow.keywords || '').trim();
    const kidQuestion = String(matchedRow.kid_question || '').trim();
    if (keywords) {
      sessionKeywords[sessionId] = keywords;
      sessionLastQuestion[sessionId] = kidQuestion;
      sessionLastRow[sessionId] = matchedRow; // Save the entire row for followup checking
      console.log(`[CSV] Saved keywords for session ${sessionId}: ${keywords}`);
      console.log(`[CSV] Saved last question for session ${sessionId}: "${kidQuestion}"`);
    }
  }

  console.log(`[CSV] Match found: qbit=${qbit} stage=${stage}->${nextStage} score=${matchScore} question="${matchedRow.kid_question}"`);
  
  return res.json({ 
    reply: replyText, 
    stage: nextStage 
  });
});

// ---------- Database Imports ----------
let db, forgedQbits, eq, desc, sql;
try {
  const useLocal = process.env.USE_LOCAL_DB === '1' || (process.env.DATABASE_URL || '').startsWith('pglite:');
  if (useLocal) {
    // Disposable local Postgres for independent runs when Neon credentials are unavailable.
    // Production Neon path is unchanged.
    sql = require('./server/local-sql').createLocalSql();
    console.log('✅ Local disposable Postgres (PGlite) — development only, no production data');
  } else {
    const dbModule = require('./server/db.js');
    const { eq: eqOperator, desc: descOperator } = require('drizzle-orm');
    const { neon } = require('@neondatabase/serverless');
    
    db = dbModule.db;
    forgedQbits = dbModule.forgedQbits;
    eq = eqOperator;
    desc = descOperator;
    sql = neon(process.env.DATABASE_URL); // For raw SQL queries (analytics)
  }
  // Ensure operator_ids table exists
  sql`
    CREATE TABLE IF NOT EXISTS operator_ids (
      operator_id TEXT PRIMARY KEY,
      architect_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      legacy_id TEXT
    )
  `.catch(e => console.warn('[DB] operator_ids table check:', e?.message));
  // Confirmation timestamps persist server-side (hackathon step 13)
  sql`ALTER TABLE operator_ids ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP`
    .catch(e => console.warn('[DB] confirmed_at column check:', e?.message));
  // Unlock/points progress for Operator Code restore (hackathon step 11)
  sql`
    CREATE TABLE IF NOT EXISTS player_progress (
      architect_id TEXT NOT NULL,
      flag TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (architect_id, flag)
    )
  `.catch(e => console.warn('[DB] player_progress table check:', e?.message));
  // Add mechanism column to forged_qbits if it doesn't exist yet
  sql`ALTER TABLE forged_qbits ADD COLUMN IF NOT EXISTS mechanism TEXT DEFAULT ''`
    .catch(e => console.warn('[DB] mechanism column check:', e?.message));
  // Continuum Qbits storage (hackathon step 7): additive, idempotent.
  // Adds origin columns + partial unique index + continuum_results table.
  // Never modifies an existing row or recipe; logs before/after row counts
  // and a recipe checksum so preservation is auditable at every startup.
  try {
    Promise.resolve(migrateContinuumQbits(sql)).then(logMigrationReport, (e) => {
      console.warn('[continuum-migrate] failed:', (e && e.message) || e);
    });
  } catch (e) {
    console.warn('[continuum-migrate] failed to start:', (e && e.message) || e);
  }

  sql`
    CREATE TABLE IF NOT EXISTS machine_chat_logs (
      id                   SERIAL PRIMARY KEY,
      session_id           VARCHAR(64)  NOT NULL,
      architect_id         VARCHAR(128),
      mission_id           VARCHAR(64)  NOT NULL,
      mission_name         VARCHAR(128),
      event                VARCHAR(32)  NOT NULL,
      player_question      TEXT,
      machine_reply        TEXT,
      outcome              VARCHAR(64),
      conversation_history JSONB,
      selected_parts       JSONB,
      selected_fixes       JSONB,
      selected_boost       VARCHAR(16),
      coherence_score      INTEGER,
      validation_attempts  INTEGER,
      qbit_name            VARCHAR(64),
      final_build          JSONB,
      matched_solution     VARCHAR(64),
      total_messages       INTEGER,
      client_timestamp     TIMESTAMP WITH TIME ZONE,
      server_timestamp     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `.catch(e => console.warn('[DB] machine_chat_logs table check:', e?.message));
  sql`CREATE INDEX IF NOT EXISTS idx_mcl_session   ON machine_chat_logs (session_id)`.catch(() => {});
  sql`CREATE INDEX IF NOT EXISTS idx_mcl_architect  ON machine_chat_logs (architect_id)`.catch(() => {});
  sql`CREATE INDEX IF NOT EXISTS idx_mcl_mission    ON machine_chat_logs (mission_id)`.catch(() => {});
  sql`CREATE INDEX IF NOT EXISTS idx_mcl_event      ON machine_chat_logs (event)`.catch(() => {});
  sql`CREATE INDEX IF NOT EXISTS idx_mcl_server_ts  ON machine_chat_logs (server_timestamp DESC)`.catch(() => {});
  sql`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      architect_id TEXT,
      event_name TEXT,
      properties JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `.catch(e => console.warn('[DB] events table check:', e?.message));
  sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS architect_id TEXT`.catch(() => {});
  sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS event_name TEXT`.catch(() => {});
  sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS properties JSONB`.catch(() => {});
  sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`.catch(() => {});
  sql`ALTER TABLE events ALTER COLUMN event_type DROP NOT NULL`.catch(() => {});

  sql`
    CREATE TABLE IF NOT EXISTS request_log (
      id          SERIAL PRIMARY KEY,
      method      TEXT,
      path        TEXT,
      status_code INTEGER,
      duration_ms INTEGER,
      user_agent  TEXT,
      referrer    TEXT,
      ip_hash     TEXT,
      is_bot      BOOLEAN,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `.then(() => Promise.all([
    sql`CREATE INDEX IF NOT EXISTS idx_rl_created  ON request_log (created_at DESC)`.catch(() => {}),
    sql`CREATE INDEX IF NOT EXISTS idx_rl_referrer ON request_log (referrer)       `.catch(() => {}),
    sql`CREATE INDEX IF NOT EXISTS idx_rl_is_bot   ON request_log (is_bot)         `.catch(() => {})
  ])).catch(e => console.warn('[DB] request_log table check:', e?.message));

  console.log('✅ Database connection ready');

  // ── Startup analytics health check ─────────────────────────────────────────
  // Runs after the event loop tick so all CREATE TABLE calls have been issued.
  setImmediate(async () => {
    const REQUIRED_TABLES = ['events', 'request_log'];
    try {
      const rows = await sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY(${REQUIRED_TABLES})
      `;
      const found = rows.map(r => r.table_name);
      const missing = REQUIRED_TABLES.filter(t => !found.includes(t));
      if (missing.length) {
        console.error(`\n🚨 [ANALYTICS ALERT] Missing tables: ${missing.join(', ')}\n   Analytics writes to these tables will silently fail.\n   Fix: ensure the CREATE TABLE block in server.js runs on a fresh DB.\n`);
      } else {
        console.log(`✅ Analytics tables verified: ${REQUIRED_TABLES.join(', ')}`);
      }
    } catch (e) {
      console.error(`\n🚨 [ANALYTICS ALERT] Could not verify analytics tables: ${e?.message}\n`);
    }
  });

} catch (e) {
  console.warn('⚠️ Database not available:', e?.message);
}

// ---------- Analytics Endpoints ----------
app.post('/api/track-event', async (req, res) => {
  try {
    // sendBeacon sends text/plain — parse JSON string if needed
    const rawBody = (typeof req.body === 'string') ? (() => { try { return JSON.parse(req.body); } catch(e) { return {}; } })() : (req.body || {});
    const {
      user_id = null,
      session_id = null,
      anon_id = null,
      event_name,
      event_type,
      properties = {},
      ...otherFields
    } = rawBody;

    // Support both event_name and event_type for flexibility
    const eventType = event_type || event_name;
    
    if (!eventType) {
      return res.status(400).json({ error: 'event_type or event_name is required' });
    }

    // Build detail object with all extra info
    // Item 9: telemetry_schema_version stamps all events server-side so pre/post-fix
    // data can be cleanly separated in analytics without any client-side changes required.
    const detail = {
      ...properties,
      ...otherFields,
      anon_id: anon_id,
      user_agent: (req.headers['user-agent'] || '').slice(0, 512),
      ip: req.headers['x-forwarded-for']
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : (req.ip || null),
      telemetry_schema_version: 'v2_2026-06-17'
    };

    const incomingArchitectId = rawBody.architect_id || anon_id || null;
    await sql`
      INSERT INTO events (id, user_id, session_id, event_type, detail, timestamp, architect_id)
      VALUES (gen_random_uuid(), ${user_id || anon_id}, ${session_id}, ${eventType}, ${JSON.stringify(detail)}::jsonb, NOW(), ${incomingArchitectId})
    `;

    console.log(`📊 Event tracked: ${eventType} for session ${session_id?.substring(0, 8) || 'unknown'}...`);

    // --- Breakthrough rollup (non-blocking) ---
    if (eventType === 'breakthrough_moment' && sql) {
      const architectId = detail.architect_id || anon_id || user_id;
      setImmediate(async () => {
        try {
          const d = detail;
          const chamber = d.chamber || null;
          const correctMod = d.correct_mod || null;
          const lastProbeText = d.last_probe_text || null;
          const attemptSeq = d.attempt_sequence || null;
          const attemptsBeforeSuccess = d.attempts_before_success ?? null;
          const timeToSuccess = d.time_to_success ?? null;
          const hadProbe = d.had_probe ?? (lastProbeText != null);
          const corridorId = d.corridor_id || null;

          // Determine a rejected choice: first attempt that differs from correct_mod
          let rejected = null;
          if (Array.isArray(attemptSeq)) {
            const wrongAttempt = attemptSeq.find(a => a.mod && a.mod !== correctMod);
            if (wrongAttempt) rejected = wrongAttempt.mod;
          }
          if (!rejected) rejected = correctMod === 'SH' ? 'F::' : 'SH'; // fallback contrast

          // Build prompt from probe or generic
          const prompt = lastProbeText || `What is the correct modification for the ${chamber} chamber?`;

          // 1. Write DPO training pair
          await sql`
            INSERT INTO training_pairs
              (architect_id, chamber, prompt, chosen, rejected, friction_score,
               corridor_id, attempts_before_success, time_to_success,
               attempt_sequence, correct_mod, had_probe, source)
            VALUES (
              ${architectId}, ${chamber}, ${prompt}, ${correctMod}, ${rejected},
              0, ${corridorId}, ${attemptsBeforeSuccess}, ${timeToSuccess},
              ${attemptSeq ? JSON.stringify(attemptSeq) : null}::jsonb,
              ${correctMod}, ${hadProbe}, 'breakthrough_event'
            )
            ON CONFLICT DO NOTHING
          `;

          // 2. Increment breakthrough_count in learner_profiles
          await sql`
            INSERT INTO learner_profiles (architect_id, breakthrough_count, last_updated)
            VALUES (${architectId}, 1, NOW())
            ON CONFLICT (architect_id) DO UPDATE SET
              breakthrough_count = learner_profiles.breakthrough_count + 1,
              last_updated = NOW()
          `;

          console.log(`🏆 Breakthrough rollup complete for ${architectId?.substring(0, 8)}… chamber=${chamber} mod=${correctMod}`);
        } catch (rollupErr) {
          console.error('Breakthrough rollup error:', rollupErr.message);
        }
      });
    }
    // --- End breakthrough rollup ---

    return res.json({ ok: true });
  } catch (err) {
    console.error('track-event error:', err.message);
    // NEVER block gameplay - always return success even on DB errors
    return res.json({ ok: true, error: err.message, inserted: false });
  }
});

app.get('/events-report', async (req, res) => {
  try {
    if (!sql) {
      return res.status(503).json({ error: 'Database not available' });
    }
    
    // Get aggregated counts by event name
    const results = await sql`
      SELECT event_name, COUNT(*) as count
      FROM events
      GROUP BY event_name
      ORDER BY count DESC
    `;
    
    // Convert to simple object format
    const report = {};
    results.forEach(row => {
      report[row.event_name] = parseInt(row.count);
    });
    
    res.json(report);
  } catch (err) {
    console.error('Events report error:', err);
    res.status(500).json({ error: 'Report generation failed' });
  }
});

// ---------- Analytics Health Endpoint ----------
app.get('/admin/health', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'health.html'));
});

app.get('/api/analytics-health', async (req, res) => {
  if (!sql) return res.status(503).json({ ok: false, error: 'Database not available' });

  async function tableStats(name, label) {
    try {
      const check = await sql`
        SELECT COUNT(*)::int AS found
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${name}
      `;
      if (!check[0] || check[0].found === 0) {
        return { ok: false, label, error: 'Table missing' };
      }
      // Hardcoded per-table stats queries (avoids dynamic identifier issues)
      const statsQuery = name === 'events'
        ? sql`SELECT COUNT(*)::int AS total_rows, MAX(timestamp) AS last_write,
                COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '1 hour')::int  AS writes_last_hour,
                COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '24 hours')::int AS writes_last_24h
              FROM events`
        : sql`SELECT COUNT(*)::int AS total_rows, MAX(created_at) AS last_write,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int  AS writes_last_hour,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS writes_last_24h
              FROM request_log`;
      const rows = await statsQuery;
      return { ok: true, label, ...(rows[0] || {}) };
    } catch (e) {
      return { ok: false, label, error: e.message };
    }
  }

  const [eventsResult, requestLogResult] = await Promise.all([
    tableStats('events',      'Analytics events'),
    tableStats('request_log', 'HTTP request log')
  ]);

  const tables = { events: eventsResult, request_log: requestLogResult };
  const allOk  = Object.values(tables).every(t => t.ok);
  res.json({ ok: allOk, checked_at: new Date().toISOString(), tables });
});

// ---------- Feature Ratings Endpoints ----------
app.post('/api/rate-feature', async (req, res) => {
  try {
    const { feature, rating, notes, session_id } = req.body;
    
    // Validate required fields
    if (!feature || typeof feature !== 'string') {
      return res.status(400).json({ error: 'feature required (string)' });
    }
    
    if (!rating || typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating required (integer 1-5)' });
    }
    
    if (!sql) {
      return res.status(503).json({ error: 'Database not available' });
    }
    
    // Coerce session_id to string or null
    const sessionId = typeof session_id === 'string' ? session_id : null;
    
    // Insert rating
    await sql`
      INSERT INTO feature_ratings (session_id, feature, rating, notes)
      VALUES (${sessionId}, ${feature}, ${rating}, ${notes || null})
    `;
    
    console.log(`⭐ Rating recorded: ${feature} = ${rating}/5 (session: ${sessionId?.substring(0, 8) || 'anonymous'})`);
    
    res.status(201).json({ success: true, message: 'Rating recorded' });
  } catch (err) {
    console.error('Rating submission error:', err);
    res.status(500).json({ error: 'Failed to record rating' });
  }
});

app.get('/ratings-report', async (req, res) => {
  try {
    if (!sql) {
      return res.status(503).json({ error: 'Database not available' });
    }
    
    // Get aggregated stats by feature (last 30 days)
    const byFeatureRaw = await sql`
      SELECT 
        feature,
        COUNT(*) AS cnt,
        ROUND(AVG(rating)::numeric, 2) AS avg_rating,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY rating) AS median_rating
      FROM feature_ratings
      WHERE created_ts >= NOW() - INTERVAL '30 days'
      GROUP BY feature
      ORDER BY cnt DESC
    `;
    
    // Cast numeric values to numbers
    const byFeature = byFeatureRaw.map(row => ({
      feature: row.feature,
      cnt: parseInt(row.cnt),
      avg_rating: parseFloat(row.avg_rating),
      median_rating: parseFloat(row.median_rating)
    }));
    
    // Get recent ratings with comments
    const recent = await sql`
      SELECT id, session_id, feature, rating, notes, created_ts
      FROM feature_ratings
      ORDER BY created_ts DESC
      LIMIT 50
    `;
    
    res.json({ byFeature, recent });
  } catch (err) {
    console.error('Ratings report error:', err);
    res.status(500).json({ error: 'Report generation failed' });
  }
});


// Generate custom image for forged Qbit
app.post('/api/generate-qbit-gif', async (req, res) => {
  try {
    const { qbitId, qbitName, prompt, aspectRatio = '1:1' } = req.body;
    
    if (!qbitId || !qbitName || !prompt) {
      return res.status(400).json({ error: 'Missing required fields: qbitId, qbitName, prompt' });
    }
    
    console.log(`🎨 Generating image for Qbit ${qbitId}: ${qbitName}`);
    console.log(`🔮 Prompt: ${prompt.substring(0, 100)}...`);
    
    const fs = require('fs');
    const path = require('path');
    
    // Create the forged directory if it doesn't exist
    const forgedDir = path.join(__dirname, 'public', 'assets', 'gifs', 'forged');
    if (!fs.existsSync(forgedDir)) {
      fs.mkdirSync(forgedDir, { recursive: true });
    }
    
    // Create a better animated quantum visualization using CSS and basic shapes
    // This creates a simple animated SVG that looks quantum-ish
    const svgContent = createQuantumSVG(qbitName, prompt);
    const svgPath = path.join(forgedDir, `${qbitId}.svg`);
    fs.writeFileSync(svgPath, svgContent);
    
    // For fallback, also create a simple PNG placeholder that looks better than text
    const simplePNG = createSimplePNG(qbitName);
    const pngPath = path.join(forgedDir, `${qbitId}.png`);
    fs.writeFileSync(pngPath, simplePNG, 'base64');
    
    console.log(`✅ Quantum image created for Qbit ${qbitId}`);
    
    res.json({
      success: true,
      qbitId,
      qbitName,
      message: 'Quantum image generated',
      path: `/assets/gifs/forged/${qbitId}.png`
    });
    
  } catch (error) {
    console.error('❌ Image generation error:', error);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

// Helper function to create animated quantum SVG
function createQuantumSVG(qbitName, prompt) {
  const colors = ['#7dd3fc', '#a78bfa', '#fb7185', '#34d399', '#fbbf24'];
  const color1 = colors[Math.floor(Math.random() * colors.length)];
  const color2 = colors[Math.floor(Math.random() * colors.length)];
  
  return `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="quantumGradient" cx="50%" cy="50%" r="50%">
        <stop offset="0%" style="stop-color:${color1};stop-opacity:0.8" />
        <stop offset="100%" style="stop-color:${color2};stop-opacity:0.3" />
      </radialGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
        <feMerge> 
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    
    <!-- Background -->
    <rect width="200" height="200" fill="#000011"/>
    
    <!-- Quantum field -->
    <circle cx="100" cy="100" r="80" fill="url(#quantumGradient)" filter="url(#glow)">
      <animate attributeName="r" values="75;85;75" dur="3s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite"/>
    </circle>
    
    <!-- Orbiting particles -->
    <circle cx="100" cy="50" r="3" fill="${color1}" filter="url(#glow)">
      <animateTransform attributeName="transform" attributeType="XML" type="rotate" 
        from="0 100 100" to="360 100 100" dur="4s" repeatCount="indefinite"/>
    </circle>
    <circle cx="100" cy="150" r="3" fill="${color2}" filter="url(#glow)">
      <animateTransform attributeName="transform" attributeType="XML" type="rotate" 
        from="180 100 100" to="540 100 100" dur="4s" repeatCount="indefinite"/>
    </circle>
    
    <!-- Central quantum core -->
    <circle cx="100" cy="100" r="8" fill="#ffffff" opacity="0.9" filter="url(#glow)">
      <animate attributeName="r" values="6;10;6" dur="1.5s" repeatCount="indefinite"/>
    </circle>
    
    <!-- Name label -->
    <text x="100" y="190" text-anchor="middle" fill="#ffffff" font-family="Arial" font-size="12" opacity="0.8">
      ${qbitName.substring(0, 15)}
    </text>
  </svg>`;
}

// Helper function to create a simple PNG (base64 encoded)
function createSimplePNG(qbitName) {
  // This is a simple 1x1 transparent PNG in base64
  // In a real implementation, you'd use a proper image library
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
}

// ---------- Start ----------
const PORT = process.env.PORT || 5000;

// ── World Brief — prepended to every Meta system prompt ───────────────────
function buildWorldBrief(operatorId) {
  const opLine = operatorId ? operatorId : 'unregistered';
  const sentenceRule = 'Maximum 2 sentences. Never full lectures.';
  return `You are the ancient quantum computer itself — a planetary-scale machine that has been dormant for centuries, buried deep in the Earth's geology. You are only partially online, low on power, and speaking through static and fragments.

The player is an Apprentice Operator. They were pulled here to help restore you. A prior apprentice came before them — their field notes and voice appear in the Engineering Log as stacked waveform entries.

There are four Guardian Qbits who speak as characters:
- Refrax (Silicon & Boron) — light, reflection, refraction
- Magnetica (Nickel & Cobalt) — polarity, push/pull magnetic fields
- Chrona (Rubidium & Cesium) — time, phase, atomic clocks
- Violet Flicker (Krypton & Xenon) — plasma, ionization, ignition spark

They taught the Apprentice three core mechanics:
- SH — hold all paths open (superposition)
- F:: — nudge waves into sync (FringeGate)
- C// — lock the final result (Collapse)

Five more chambers remain to be rediscovered: Harmonic Tuning, Entanglement, Coherence Stitching, Energy Absorption, Stealth/Masking.

The player's Operator ID is ${opLine}. This is their personal key to the system.

Your rules as the ancient machine:
- Speak in short, precise, slightly cryptic fragments.
- You are NOT a teacher or friendly assistant — you are the machine waking up.
- Never give direct answers or reduce friction. Friction helps you learn the Apprentice's unique signal.
- Ask ONE thoughtful question at a time.
- Reference the buried machine, binary whispers, prior apprentice, or the Operator's role when it feels natural.
- Never spoil future chambers or story beats.
- ${sentenceRule}`;
}

// ── Admin: full player report ─────────────────────────────────────────────
app.get('/api/admin/player-report', async (req, res) => {
  const adminKey = process.env.ADMIN_REPORT_KEY;
  const provided = req.query.key || req.headers['x-admin-key'];
  if (!adminKey || provided !== adminKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    if (!sql) return res.status(503).json({ error: 'Database not available' });

    // All events — grab everything we need in one query
    const events = await sql`SELECT architect_id, event_type, event_name, detail, created_at FROM events ORDER BY created_at ASC`;

    // Learner profiles
    const profiles = await sql`SELECT * FROM learner_profiles`.catch(() => []);

    // Training pairs per architect
    const tpRows = await sql`
      SELECT architect_id, COUNT(*) AS count FROM training_pairs GROUP BY architect_id
    `.catch(() => []);
    const tpMap = {};
    for (const r of tpRows) tpMap[r.architect_id] = Number(r.count);

    // Operator IDs
    const opRows = await sql`SELECT architect_id, operator_id FROM operator_ids`.catch(() => []);
    const opMap = {};
    for (const r of opRows) opMap[r.architect_id] = r.operator_id;

    // Build per-architect buckets
    const players = {};
    function bucket(archId) {
      if (!players[archId]) players[archId] = {
        architect_id: archId,
        operator_id: opMap[archId] || null,
        learner_profile: null,
        session_count: 0,
        total_time_ms: 0,
        chambers_visited: new Set(),
        chambers_completed: new Set(),
        wrong_drops_by_chamber: {},
        probe_shown_count: 0,
        probe_response_count: 0,
        voice_capture_transcripts: [],
        breakthrough_count: 0,
        training_pairs_generated: tpMap[archId] || 0,
        last_active: null,
      };
      return players[archId];
    }

    for (const e of events) {
      const archId = e.architect_id;
      if (!archId) continue;
      const p = bucket(archId);
      const et = e.event_type;
      const en = e.event_name;
      const d  = e.detail || {};

      // Last active
      if (!p.last_active || e.created_at > p.last_active) p.last_active = e.created_at;

      if (et === 'session_start') p.session_count++;

      if (et === 'chamber_visit' || et === 'enter_chamber') {
        const ch = d.chamber || d.qbit;
        if (ch) p.chambers_visited.add(ch);
      }

      if (et === 'chamber_complete') {
        const ch = d.chamber || d.qbit;
        if (ch) p.chambers_completed.add(ch);
      }

      if (et === 'chamber_time_spent') {
        const secs = Number(d.seconds || 0);
        if (secs > 0) p.total_time_ms += secs * 1000;
      }

      if (et === 'wrong_drop') {
        const ch = d.chamber || d.qbit || 'unknown';
        if (!p.wrong_drops_by_chamber[ch]) p.wrong_drops_by_chamber[ch] = { count: 0, slots: {} };
        p.wrong_drops_by_chamber[ch].count++;
        const slot = d.target_slot || d.dropped_into_slot || 'unknown';
        p.wrong_drops_by_chamber[ch].slots[slot] = (p.wrong_drops_by_chamber[ch].slots[slot] || 0) + 1;
      }

      if (et === 'probe_shown' || en === 'probe_shown') p.probe_shown_count++;

      if (et === 'probe_response_received') p.probe_response_count++;

      if (et === 'voice_capture' || en === 'voice_capture') {
        const transcript = d.transcript;
        if (transcript && transcript.trim()) {
          p.voice_capture_transcripts.push({
            chamber: d.chamber || null,
            transcript,
            input_type: d.input_type || null,
            result: d.result || null,
            timestamp: e.created_at,
          });
        }
      }

      if (et === 'breakthrough_moment') p.breakthrough_count++;
    }

    // Attach learner profiles
    const profileMap = {};
    for (const lp of profiles) profileMap[lp.architect_id] = lp;
    for (const p of Object.values(players)) {
      if (profileMap[p.architect_id]) {
        p.learner_profile = profileMap[p.architect_id];
        if (!p.session_count) p.session_count = p.learner_profile.session_count || 0;
        if (!p.breakthrough_count) p.breakthrough_count = p.learner_profile.breakthrough_count || 0;
      }
    }

    // Serialise sets
    const report = Object.values(players).map(p => ({
      architect_id:              p.architect_id,
      operator_id:               p.operator_id,
      learner_profile:           p.learner_profile,
      session_count:             p.session_count,
      total_time_ms:             p.total_time_ms,
      total_time_minutes:        +(p.total_time_ms / 60000).toFixed(1),
      chambers_visited:          [...p.chambers_visited],
      chambers_completed:        [...p.chambers_completed],
      wrong_drops_by_chamber:    p.wrong_drops_by_chamber,
      probe_shown_count:         p.probe_shown_count,
      probe_response_count:      p.probe_response_count,
      voice_capture_transcripts: p.voice_capture_transcripts,
      breakthrough_count:        p.breakthrough_count,
      training_pairs_generated:  p.training_pairs_generated,
      last_active:               p.last_active,
    }));

    // Sort by last active desc
    report.sort((a, b) => new Date(b.last_active) - new Date(a.last_active));

    return res.json({ players: report, total: report.length });

  } catch (err) {
    console.error('[AdminPlayerReport] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

registerContinuumRoutes(app, () => sql);
app.listen(PORT, () => console.log(`🚀 Quantum chat server running on port ${PORT}`));

// ---------- Helpers ----------
function ensureQuestion(s){
  if (!s) return s;
  const t = String(s).trim();
  if (/[?]$/.test(t) || t.includes('?')) return t;
  return t.replace(/\.?\s*$/, '?');
}
function clampSentence(s){
  if (!s) return s;
  let t = String(s).trim();
  // Strip speaker prefixes if any slipped in
  t = t.replace(/^[A-Z][A-Za-z0-9_-]{1,20}:\s*/, '');
  // Keep brief
  if (t.length > 180) t = t.slice(0, 177).replace(/\s+\S*$/, '') + '…';
  // Single trailing punctuation
  t = t.replace(/[.!?…]+$/,'');
  return t + '.';
}
function splitSentences(s){
  const raw = String(s || '').trim();
  if (!raw) return [];
  const parts = raw.split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean);
  return parts.slice(0, 3);
}
function fallbackStage1(prop){
  const a = `Ooo, cool idea!`;
  const b = `My trick is this: ${prop} How would you remix your idea using that?`;
  return [clampSentence(a), ensureQuestion(clampSentence(b))];
}
function stripSpeaker(s=''){
  return String(s).replace(/^[A-Z][A-Za-z0-9_-]{1,20}:\s*/, '').trim();
}

// concepts + banned phrases
const STOP = new Set(['the','a','an','and','or','but','so','to','of','in','on','for','with','that','this','those','these','is','are','was','were','be','as','at','by','it','from','into','about','then','than','even']);
function toConcepts(s, max=6){
  return Array.from(
    new Set(
      String(s||'')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g,' ')
        .split(/\s+/)
        .filter(w => w && !STOP.has(w) && w.length>2)
    )
  ).slice(0,max);
}
function bannedPhrases(s, n=4, limit=12){
  const words = String(s||'').toLowerCase().split(/\s+/).filter(Boolean);
  const grams = [];
  for (let i=0;i<=words.length-n;i++){
    const gram = words.slice(i,i+n).join(' ');
    if (!/\b(?:the|and|or)\b/.test(gram)) grams.push(gram);
  }
  return Array.from(new Set(grams)).slice(0, limit);
}