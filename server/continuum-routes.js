'use strict';
// Continuum challenge + interpretation routes with offline fallback.
//
// POST /api/continuum/challenges/next  body {architect_id}
// Response: {id, source: 'meta'|'offline', title, brief, roles, candidateIds,
//   verified, difficulty: 1-3, mode: 'available'|'invent', analysis: string[]}
//   — verified is true
//   when the solver proves the challenge (two distinct pool candidates fill
//   both roles, or the Invent proof holds). Never includes a solution (no
//   mapping of roles to candidates). Difficulty is decided by the server from
//   the player's last 5 continuum_results; the client cannot set it.
//
// POST /api/continuum/attempts/interpret  body {challenge_id, architect_id, assigned_qbit_ids:[id,id]}
// Response: {passed, feedback, source:'meta'|'offline'}. No points field.
// Pass/fail always comes from checkSolution() on server-stored roles; any
// roles sent by the client are ignored. Each judged attempt is recorded in
// continuum_results. Unknown/expired challenge_id -> 410.

const crypto = require('crypto');
const {
  selectCandidates,
  validateChallenge,
  validateInventChallenge,
  rolesMatchRequired,
  checkSolution,
  deriveCapabilities,
  normalizeRoleIds,
  levelForResults,
  buildAvailablePlan,
  buildInventPlan,
  needsTextForRole,
} = require('./continuum-rules');
const { generateChallenge } = require('./continuum-meta');
const {
  generateInterpretation,
  OFFLINE_FEEDBACK_PASS,
  OFFLINE_FEEDBACK_FAIL,
} = require('./continuum-interpret');
const { buildAnalysis } = require('./continuum-analysis');

// Offline templates copied exactly from public/continuum.html missionTemplates.
// Used only for level-1 offline fallback.
const OFFLINE_TEMPLATES = [
  { id: 'harmonic_rift', name: 'Harmonic Rift', desc: 'Resonance fracture detected. Needs a Qbit that can keep quantum states synchronized until energy is released on cue, and one that can drain noise into a quiet ground.', difficulty: '🔥🔥🔥', roles: [{ id: 1, name: 'Phase Anchor', req: ['phase-lock'], weight: 0.6, critical: true }, { id: 2, name: 'Stabilizer', req: ['ground'], weight: 0.4, critical: true }] },
  { id: 'entanglement_cascade', name: 'Entanglement Cascade', desc: 'Nodes desyncing. Needs a Qbit that can link distant quantum states so their outcomes are correlated, and one that can keep quantum states synchronized until energy is released on cue.', difficulty: '🔥🔥🔥🔥', roles: [{ id: 1, name: 'Link Bridge', req: ['entangle'], weight: 0.5, critical: true }, { id: 2, name: 'Timing Sync', req: ['phase-lock'], weight: 0.5, critical: true }] },
];

// Canned stories for level 2/3 offline fallback. The ROLE TAGS always come
// from the server-computed plan (solver-proven); only the words are canned.
const OFFLINE_LEVEL_STORIES = {
  2: {
    title: 'Dual-Signature Breach, Sector 12',
    brief: 'Two failure modes overlap in one conduit. Cover the combined signature and stabilize the adjacent relay.',
    names: ['Dual Anchor', 'Relay Stabilizer'],
  },
  3: {
    title: 'Unmapped Resonance, Sector 9',
    brief: 'The lattice calls for a signature no Qbit in the network carries. Forge the missing response and hold the anchor relay.',
    names: ['Unmapped Response', 'Anchor Relay'],
  },
};

const OWN_SAMPLE_LIMIT = 20;
const PUBLIC_SAMPLE_LIMIT = 20;
const CANDIDATE_LIMIT = 12;
const RESULTS_WINDOW = 5;
const MAX_AI_ATTEMPTS = 2;
// One challenge request: at most 2 Meta calls (SDK maxRetries is 0, so one
// attempt equals one call) inside one shared ~20s budget across both attempts.
const CHALLENGE_TOTAL_TIMEOUT_MS = 20000;

// Server-side challenge memory: issued challenges keyed by id (roles +
// candidateIds), max 500 entries, 2-hour expiry. Clients are never trusted
// to send roles back; interpret reads them from here.
const MAX_CHALLENGES = 500;
const CHALLENGE_TTL_MS = 2 * 60 * 60 * 1000;
const challenges = new Map();

const EXPIRED_MESSAGE =
  'This challenge has faded from the Continuum. Request a new one; your Qbits are safe.';

function pruneExpiredChallenges(now) {
  for (const [id, entry] of challenges) {
    if (entry.expiresAt <= now) challenges.delete(id);
  }
}

function copyRole(role) {
  const out = { id: role.id, name: role.name };
  if (Array.isArray(role.reqAll)) out.reqAll = [...role.reqAll];
  else if (Array.isArray(role.req)) out.req = [...role.req];
  return out;
}

function storeChallenge(id, roles, candidateIds) {
  const now = Date.now();
  if (challenges.size >= MAX_CHALLENGES) pruneExpiredChallenges(now);
  while (challenges.size >= MAX_CHALLENGES) {
    challenges.delete(challenges.keys().next().value);
  }
  challenges.set(id, {
    roles: roles.map(copyRole),
    candidateIds: [...candidateIds],
    expiresAt: now + CHALLENGE_TTL_MS,
  });
}

function getChallenge(id) {
  const entry = challenges.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    challenges.delete(id);
    return null;
  }
  return entry;
}

function toResponseRoles(roles) {
  // Each response role carries its function-phrased need, rendered from the
  // ONE fixed server-side phrase map (code, never Meta).
  return roles.map((role) => ({ ...copyRole(role), needs: needsTextForRole(role) }));
}

// planForLevel(level, candidates): the solver-proven role tags for the level,
// downgrading when the pool cannot support it. Level 1 carries no fixed tags:
// Meta chooses single-tag reqs as today. Returns {difficulty, mode, roles}
// where roles is null at level 1 (model's choice) and fixed tags at 2-3.
function planForLevel(level, candidates) {
  if (level >= 3) {
    const invent = buildInventPlan(candidates);
    if (invent) return invent;
  }
  if (level >= 2) {
    const available = buildAvailablePlan(candidates);
    if (available) return available;
  }
  return { difficulty: 1, mode: 'available', roles: null };
}

function isSingleTagReqRole(role) {
  return (
    role &&
    typeof role === 'object' &&
    !Array.isArray(role.reqAll) &&
    Array.isArray(role.req) &&
    role.req.length === 1
  );
}

function offlineChallenge(candidateIds, candidates, plan) {
  const pool = Array.isArray(candidates) ? candidates : [];
  const difficulty = plan && plan.difficulty === 3 ? 3 : plan && plan.difficulty === 2 ? 2 : 1;
  if (difficulty === 1 || !(plan && Array.isArray(plan.roles))) {
    const template = OFFLINE_TEMPLATES[Math.floor(Math.random() * OFFLINE_TEMPLATES.length)];
    const roles = toResponseRoles(template.roles);
    const verdict = validateChallenge(
      { title: template.name, brief: template.desc, roles: template.roles },
      pool
    );
    return {
      id: crypto.randomUUID(),
      source: 'offline',
      title: template.name,
      brief: template.desc,
      roles,
      candidateIds,
      verified: verdict.ok,
      difficulty: 1,
      mode: 'available',
      // Offline panel: deterministic lines (pool order, fallback rationale).
      analysis: buildAnalysis({
        candidates: pool,
        roles: template.roles,
        mode: 'available',
        difficulty: 1,
        verified: verdict.ok,
        rationale: undefined,
        random: null,
      }),
    };
  }
  const story = OFFLINE_LEVEL_STORIES[difficulty];
  const roles = plan.roles.map((role, index) => ({
    ...copyRole(role),
    id: `r${index + 1}`,
    name: story.names[index],
  }));
  const verdict =
    difficulty === 3
      ? validateInventChallenge(
        { title: story.title, brief: story.brief, roles },
        Array.isArray(candidates) ? candidates : []
      )
      : validateChallenge(
        { title: story.title, brief: story.brief, roles },
        Array.isArray(candidates) ? candidates : []
      );
  return {
    id: crypto.randomUUID(),
    source: 'offline',
    title: story.title,
    brief: story.brief,
    roles: toResponseRoles(roles),
    candidateIds,
    verified: verdict.ok,
    difficulty,
    mode: plan.mode,
    analysis: buildAnalysis({
      candidates: pool,
      roles,
      mode: plan.mode,
      difficulty,
      verified: verdict.ok,
      rationale: undefined,
      random: null,
    }),
  };
}

async function loadQbitSamples(sql, architectId) {
  // Bounded samples only: never the whole table. Only the columns the
  // candidate list needs (id, name, boost, fixes); nothing private is selected.
  const [ownRows, publicRows] = await Promise.all([
    sql`SELECT id, name, boost, fixes FROM forged_qbits WHERE architect_id = ${architectId} ORDER BY created_at DESC LIMIT ${OWN_SAMPLE_LIMIT}`.catch(() => []),
    sql`SELECT id, name, boost, fixes FROM forged_qbits WHERE visibility = 'public' AND architect_id != ${architectId} ORDER BY created_at DESC LIMIT ${PUBLIC_SAMPLE_LIMIT}`.catch(() => []),
  ]);
  return {
    ownRows: Array.isArray(ownRows) ? ownRows : [],
    publicRows: Array.isArray(publicRows) ? publicRows : [],
  };
}

async function loadRecentResults(sql, architectId) {
  // The player's latest results drive the level. Any failure (or a missing
  // table on an old database) means level 1, never an error.
  try {
    const rows = await sql`SELECT passed FROM continuum_results WHERE architect_id = ${architectId} ORDER BY created_at DESC LIMIT ${RESULTS_WINDOW}`;
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function recordResult(sql, architectId, challengeId, passed) {
  // Written only here, from the rules-decided result. A write failure must
  // never fail the interpretation response.
  try {
    await sql`INSERT INTO continuum_results (architect_id, challenge_id, passed) VALUES (${architectId}, ${challengeId}, ${passed})`;
    return true;
  } catch (err) {
    console.log(
      `[continuum] results write failed: ${String((err && err.message) || err).slice(0, 120)}`
    );
    return false;
  }
}

function registerContinuumRoutes(app, getSql, options = {}) {
  app.post('/api/continuum/challenges/next', async (req, res) => {
    try {
      const architectId = req.body && req.body.architect_id;
      if (!architectId || typeof architectId !== 'string') {
        return res.status(400).json({ error: 'architect_id required' });
      }
      // NOTE: difficulty/level/mode are NEVER read from the request body.
      // The server decides them from continuum_results + the pool below.

      let ownRows = [];
      let publicRows = [];
      let recentResults = [];
      try {
        const sql = getSql();
        if (sql) {
          const samples = await loadQbitSamples(sql, architectId);
          ownRows = samples.ownRows;
          publicRows = samples.publicRows;
          recentResults = await loadRecentResults(sql, architectId);
        }
      } catch {
        ownRows = [];
        publicRows = [];
        recentResults = [];
      }

      const candidates = selectCandidates(ownRows, publicRows, CANDIDATE_LIMIT);
      const candidateIds = candidates.map((c) => c.id);
      const plan = planForLevel(levelForResults(recentResults), candidates);

      const aiEnabled =
        process.env.CONTINUUM_AI_ENABLED === '1' && !!process.env.MODEL_API_KEY;
      if (aiEnabled && candidates.length >= 2) {
        const deadline = Date.now() + CHALLENGE_TOTAL_TIMEOUT_MS;
        for (let attempt = 1; attempt <= MAX_AI_ATTEMPTS; attempt++) {
          const remaining = deadline - Date.now();
          if (remaining < 1000) {
            console.log('[continuum] ai budget exhausted, offline fallback');
            break;
          }
          try {
            const challenge = await generateChallenge(candidates, {
              ...(options.client ? { client: options.client } : {}),
              timeoutMs: remaining,
              level: plan.difficulty,
              ...(plan.roles ? { requiredRoles: plan.roles } : {}),
            });
            let verdict;
            if (plan.difficulty === 3) {
              if (!rolesMatchRequired(challenge.roles, plan.roles)) {
                verdict = { ok: false, reason: 'model did not copy the required Invent tags' };
              } else {
                verdict = validateInventChallenge(challenge, candidates);
              }
            } else if (plan.difficulty === 2) {
              if (!rolesMatchRequired(challenge.roles, plan.roles)) {
                verdict = { ok: false, reason: 'model did not copy the required tags' };
              } else {
                verdict = validateChallenge(challenge, candidates);
              }
            } else {
              verdict = validateChallenge(challenge, candidates);
              if (verdict.ok && !challenge.roles.every(isSingleTagReqRole)) {
                verdict = { ok: false, reason: 'level 1 roles must be single-tag req' };
              }
            }
            if (verdict.ok) {
              // Overwrite model role ids with r1, r2 before storing or
              // returning: Meta once echoed Qbit ids here (e.g. "id":172).
              const safeRoles = normalizeRoleIds(challenge.roles);
              const issued = {
                id: crypto.randomUUID(),
                source: 'meta',
                title: challenge.title,
                brief: challenge.brief,
                roles: toResponseRoles(safeRoles),
                candidateIds,
                verified: true,
                difficulty: plan.difficulty,
                mode: plan.mode,
                analysis: buildAnalysis({
                  candidates,
                  roles: safeRoles,
                  mode: plan.mode,
                  difficulty: plan.difficulty,
                  verified: true,
                  rationale: challenge.rationale,
                }),
              };
              storeChallenge(issued.id, issued.roles, candidateIds);
              return res.json(issued);
            }
            console.log(`[continuum] ai attempt ${attempt} invalid: ${verdict.reason}`);
          } catch (err) {
            console.log(
              `[continuum] ai attempt ${attempt} failed: ${String((err && err.message) || err).slice(0, 160)}`
            );
          }
        }
      }

      const issued = offlineChallenge(candidateIds, candidates, plan);
      storeChallenge(issued.id, issued.roles, candidateIds);
      return res.json(issued);
    } catch (err) {
      console.error(
        '[continuum] route error:',
        String((err && err.message) || err).slice(0, 200)
      );
      const issued = offlineChallenge([], [], { difficulty: 1, mode: 'available', roles: null });
      storeChallenge(issued.id, issued.roles, []);
      return res.json(issued);
    }
  });

  app.post('/api/continuum/attempts/interpret', async (req, res) => {
    try {
      const body = req.body || {};
      const challengeId = body.challenge_id;
      const architectId = body.architect_id;
      const assignedIds = body.assigned_qbit_ids;
      if (
        !challengeId ||
        typeof challengeId !== 'string' ||
        !architectId ||
        typeof architectId !== 'string' ||
        !Array.isArray(assignedIds) ||
        assignedIds.length !== 2
      ) {
        return res
          .status(400)
          .json({ error: 'challenge_id, architect_id, and assigned_qbit_ids [id, id] required' });
      }

      // NOTE: any roles sent by the client are ignored. Pass/fail is decided
      // by checkSolution() against the server-stored roles below.
      const challenge = getChallenge(challengeId);
      if (!challenge) {
        return res.status(410).json({ expired: true, message: EXPIRED_MESSAGE });
      }

      let sql = null;
      try {
        sql = getSql();
      } catch {
        sql = null;
      }
      if (!sql) {
        return res.status(503).json({ error: 'Database not available' });
      }
      const rows = [];
      for (const qid of assignedIds) {
        let found = [];
        try {
          found =
            (await sql`SELECT id, name, boost, fixes, visibility, architect_id FROM forged_qbits WHERE id = ${qid} LIMIT 1`) ||
            [];
        } catch {
          found = [];
        }
        rows.push(Array.isArray(found) ? found[0] : undefined);
      }
      for (const row of rows) {
        if (!row) {
          return res.status(400).json({ error: 'unknown qbit id' });
        }
        if (row.visibility !== 'public' && row.architect_id !== architectId) {
          return res.status(400).json({ error: 'qbit not accessible' });
        }
      }

      const qbits = rows.map((row) => ({ id: row.id, name: row.name, boost: row.boost, fixes: row.fixes }));
      const passed = checkSolution(challenge.roles, qbits);

      await recordResult(sql, architectId, challengeId, passed);

      const aiEnabled =
        process.env.CONTINUUM_AI_ENABLED === '1' && !!process.env.MODEL_API_KEY;
      if (aiEnabled) {
        try {
          const feedback = await generateInterpretation(
            {
              roles: challenge.roles,
              qbits: qbits.map((qbit) => ({
                name: qbit.name,
                capabilities: deriveCapabilities(qbit),
              })),
              passed,
            },
            options.client ? { client: options.client } : {}
          );
          console.log(`[continuum] interpret ok passed=${passed} source=meta`);
          return res.json({ passed, feedback, source: 'meta' });
        } catch (err) {
          console.log(
            `[continuum] interpret ai failed: ${String((err && err.message) || err).slice(0, 160)}`
          );
        }
      }

      return res.json({
        passed,
        feedback: passed ? OFFLINE_FEEDBACK_PASS : OFFLINE_FEEDBACK_FAIL,
        source: 'offline',
      });
    } catch (err) {
      console.error(
        '[continuum] interpret route error:',
        String((err && err.message) || err).slice(0, 200)
      );
      return res.status(500).json({ error: 'interpret failed' });
    }
  });
}

module.exports = {
  registerContinuumRoutes,
  OFFLINE_TEMPLATES,
  OFFLINE_LEVEL_STORIES,
  MAX_AI_ATTEMPTS,
  CHALLENGE_TOTAL_TIMEOUT_MS,
  MAX_CHALLENGES,
  CHALLENGE_TTL_MS,
  EXPIRED_MESSAGE,
  // Test hooks for the in-memory challenge store.
  _challenges: challenges,
  _storeChallenge: storeChallenge,
  _getChallenge: getChallenge,
  _clearChallenges: () => challenges.clear(),
  _challengeCount: () => challenges.size,
};
