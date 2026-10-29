'use strict';
// Network Analysis lines for Continuum challenges (hackathon step 15).
//
// When a challenge is generated, the server also returns `analysis`: short
// lines showing only real system operations, typed into the Network Analysis
// panel on continuum.html:
//
//   - a deterministic network scan: total pool Qbits + per-capability counts;
//   - 4-5 sampled pool Qbits labeled "NETWORK SAMPLE", at least half of them
//     NOT part of any solution, so the list never reveals the answer. They
//     are random pool draws, never presented as Qbits the model considered;
//   - one rationale line: Meta-written (max 20 words) when valid, else a
//     deterministic fallback. A rationale naming any Qbit is rejected;
//   - a solver line proving the challenge (or its Invent forgeability).
//
// Pure functions except the injected sampler: pass {random} (default
// Math.random); pass random: null for deterministic pool-order picks, which
// the offline path uses. No I/O.

const {
  CAPABILITY_VOCAB,
  roleSatisfiedBy,
  containsBannedWord,
} = require('./continuum-rules');
const { mentionsQbitName } = require('./continuum-interpret');

const SOLVER_LINE_AVAILABLE_VERIFIED = 'VERIFYING SOLUTION EXISTS ... ✓';
const SOLVER_LINE_AVAILABLE_UNPROVEN = 'VERIFYING SOLUTION EXISTS ... UNPROVEN';
const SOLVER_LINE_INVENT_VERIFIED =
  'NO QBIT IN THE NETWORK CARRIES THIS COMBINATION. SOLVER: FORGEABLE ✓';
const SOLVER_LINE_INVENT_UNPROVEN = 'NO PROOF AVAILABLE. SOLVER: UNPROVEN';

const RATIONALE_MAX_WORDS = 20;

function capabilitiesOf(candidate) {
  if (candidate && Array.isArray(candidate.capabilities)) return candidate.capabilities;
  return [];
}

function candidateName(candidate) {
  if (candidate && typeof candidate.name === 'string') return candidate.name.trim();
  return '';
}

// capabilityCounts(candidates): {total, counts} with one count per vocab tag.
function capabilityCounts(candidates) {
  const pool = Array.isArray(candidates) ? candidates : [];
  const counts = {};
  for (const tag of CAPABILITY_VOCAB) counts[tag] = 0;
  for (const candidate of pool) {
    const seen = new Set();
    for (const tag of capabilitiesOf(candidate)) {
      if (Object.prototype.hasOwnProperty.call(counts, tag) && !seen.has(tag)) {
        seen.add(tag);
        counts[tag] += 1;
      }
    }
  }
  return { total: pool.length, counts };
}

// scanLine(counts): "NETWORK SCAN: 12 QBITS · ENTANGLE x4 · TUNNEL x1".
function scanLine(countResult) {
  const total = countResult && Number.isFinite(countResult.total) ? countResult.total : 0;
  const counts = (countResult && countResult.counts) || {};
  const parts = [`NETWORK SCAN: ${total} QBIT${total === 1 ? '' : 'S'}`];
  for (const tag of CAPABILITY_VOCAB) {
    const n = counts[tag] || 0;
    if (n > 0) parts.push(`${String(tag).toUpperCase()} x${n}`);
  }
  return parts.join(' · ');
}

// solutionMemberIds(roles, candidates): ids appearing in ANY valid
// two-distinct-candidate assignment (either orientation), mirroring the
// solver's pair loop. Anything else can be sampled freely.
function solutionMemberIds(roles, candidates) {
  const members = new Set();
  if (!Array.isArray(roles) || roles.length !== 2) return members;
  const pool = Array.isArray(candidates) ? candidates : [];
  const [roleA, roleB] = roles;
  for (let i = 0; i < pool.length; i++) {
    for (let j = 0; j < pool.length; j++) {
      if (i === j) continue;
      const capsI = capabilitiesOf(pool[i]);
      const capsJ = capabilitiesOf(pool[j]);
      if (roleSatisfiedBy(roleA, capsI) && roleSatisfiedBy(roleB, capsJ)) {
        if (pool[i] && pool[i].id !== undefined) members.add(String(pool[i].id));
        if (pool[j] && pool[j].id !== undefined) members.add(String(pool[j].id));
      }
    }
  }
  return members;
}

function shuffleInPlace(list, random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

// sampleLines(candidates, memberIds, {count, random}): "NETWORK SAMPLE"
// lines. At least half of the sampled Qbits are NOT in any solution; when
// too few non-solvers exist the list shrinks to preserve that invariant
// (possibly to zero). random: null keeps pool order (offline path).
function sampleLines(candidates, memberIds, options = {}) {
  const pool = Array.isArray(candidates) ? candidates.slice() : [];
  const members = memberIds instanceof Set ? memberIds : new Set();
  const random = options.random === undefined ? Math.random : options.random;
  const want = Number.isFinite(options.count)
    ? Math.max(0, Math.min(6, Math.floor(options.count)))
    : Math.min(5, pool.length);
  if (want <= 0 || pool.length === 0) return [];
  const nonSolvers = pool.filter((c) => c && !members.has(String(c.id)));
  const solvers = pool.filter((c) => c && members.has(String(c.id)));
  if (typeof random === 'function') {
    shuffleInPlace(nonSolvers, random);
    shuffleInPlace(solvers, random);
  }
  // Invariant: non-solvers >= half of emitted lines. The quota is filled
  // from non-solvers first; remaining slots prefer solvers, then backfill
  // with more non-solvers (Invent pools have no solvers at all).
  let n = Math.min(want, pool.length);
  const quota = Math.min(nonSolvers.length, Math.ceil(n / 2));
  n = Math.min(n, quota * 2);
  if (n <= 0) return [];
  const k = Math.ceil(n / 2);
  const picked = nonSolvers.slice(0, k).concat(solvers.concat(nonSolvers.slice(k)).slice(0, n - k));
  const lines = [];
  for (const candidate of picked.slice(0, n)) {
    const caps = capabilitiesOf(candidate);
    if (caps.length === 0) continue;
    const name = candidateName(candidate) || 'Unnamed Qbit';
    lines.push(`NETWORK SAMPLE: ${name} · ${String(caps[0]).toUpperCase()}`);
  }
  return lines;
}

function fallbackRationale(difficulty, mode) {
  if (mode === 'invent') return 'No network Qbit carries this, so I\'m asking you to invent it.';
  if (difficulty === 2) return 'You\'ve proven steady hands, so I\'m pairing two capabilities per trial.';
  if (difficulty === 3) return 'You\'re ready for harder work, so I\'m testing an advanced combination.';
  return 'You\'re new to the network, so I\'m starting with one capability per role.';
}

function wordCount(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

// Internal terms a rationale must never use (hackathon step 16): the line
// speaks to the player in the Continuum's voice, not in system terms.
const RATIONALE_INTERNAL_TERMS_RE = /\btags?\b|\blevel 1 needs\b|\bdifficulty\b|\bprompt\b/i;

// rationaleLine(rationale, candidates, difficulty, mode): the Meta-written
// line when valid, else the deterministic fallback. Rejected when empty,
// over 20 words, naming any Qbit, carrying a banned word or an internal
// term, or not plain text.
function rationaleLine(rationale, candidates, difficulty, mode) {
  const fallback = fallbackRationale(difficulty, mode);
  if (typeof rationale !== 'string') return fallback;
  const text = rationale.trim();
  if (!text) return fallback;
  if (wordCount(text) > RATIONALE_MAX_WORDS) return fallback;
  if (/[<>@]/.test(text) || /http/i.test(text) || /www/i.test(text)) return fallback;
  if (containsBannedWord(text) !== null) return fallback;
  if (RATIONALE_INTERNAL_TERMS_RE.test(text)) return fallback;
  if (mentionsQbitName(text, Array.isArray(candidates) ? candidates : [])) return fallback;
  return text;
}

function solverLine(mode, verified) {
  if (mode === 'invent') {
    return verified ? SOLVER_LINE_INVENT_VERIFIED : SOLVER_LINE_INVENT_UNPROVEN;
  }
  return verified ? SOLVER_LINE_AVAILABLE_VERIFIED : SOLVER_LINE_AVAILABLE_UNPROVEN;
}

// buildAnalysis({candidates, roles, mode, difficulty, verified, rationale,
// random}): the full ordered line list for the challenge response.
function buildAnalysis(options = {}) {
  const candidates = Array.isArray(options.candidates) ? options.candidates : [];
  const roles = Array.isArray(options.roles) ? options.roles : [];
  const mode = options.mode === 'invent' ? 'invent' : 'available';
  const difficulty = Number.isFinite(options.difficulty) ? options.difficulty : 1;
  const verified = options.verified === true;
  const members = solutionMemberIds(roles, candidates);
  return [
    scanLine(capabilityCounts(candidates)),
    ...sampleLines(candidates, members, { random: options.random === undefined ? Math.random : options.random }),
    rationaleLine(options.rationale, candidates, difficulty, mode),
    solverLine(mode, verified),
  ];
}

module.exports = {
  SOLVER_LINE_AVAILABLE_VERIFIED,
  SOLVER_LINE_AVAILABLE_UNPROVEN,
  SOLVER_LINE_INVENT_VERIFIED,
  SOLVER_LINE_INVENT_UNPROVEN,
  RATIONALE_MAX_WORDS,
  capabilityCounts,
  scanLine,
  solutionMemberIds,
  sampleLines,
  fallbackRationale,
  rationaleLine,
  solverLine,
  buildAnalysis,
};
