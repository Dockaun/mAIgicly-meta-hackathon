'use strict';
// Continuum deterministic rules: pure functions, no randomness, no I/O.
//
// Capability tags come from the single shared mapping in
// public/js/continuum-capabilities.js (also loaded by continuum.html):
//   boost PH~  -> ['phase-lock']
//   boost N0   -> ['ground']
//   boost EN≡  -> ['entangle']
//   boost G0   -> ['tunnel']
//   anything else -> ['hybrid']
// plus one tag per saved fix:
//   'SH' -> 'superposition', 'F::' -> 'phase-control', 'C//' -> 'collapse'

const shared = require('../public/js/continuum-capabilities');

const CAPABILITY_VOCAB = shared.CAPABILITY_VOCAB;
const BOOST_TAG_MAP = shared.BOOST_TAG_MAP;
const FIX_TAG_MAP = shared.FIX_TAG_MAP;
const TAG_PHRASES = shared.TAG_PHRASES;
const deriveCapabilities = shared.deriveCapabilities;
const roleSatisfiedBy = shared.roleSatisfiedBy;
const needsTextForRole = shared.needsTextForRole;

const MAX_TITLE_LEN = 60;
const MAX_BRIEF_LEN = 240;
const MAX_ROLE_NAME_LEN = 40;
const MAX_CANDIDATE_NAME_LEN = 30;

// Words the quantum-engineering voice never uses. The validator rejects any
// model-written challenge or feedback containing one (whole word,
// case-insensitive); the caller then retries or falls back to offline content.
const BANNED_WORDS = [
  'family',
  'friendly',
  'kind',
  'happy',
  'gentle',
  'fun',
  'cute',
  'park',
  'garden',
  'helper',
];

const BANNED_WORD_PATTERN = new RegExp(
  `\\b(${BANNED_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i'
);

// containsBannedWord(text): the offending word (lowercased) or null.
function containsBannedWord(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(BANNED_WORD_PATTERN);
  return match ? match[1].toLowerCase() : null;
}

// normalizeRoleIds(roles): overwrite every role id with r1, r2, ... so a model
// can never leak a Qbit id through a role id (e.g. "id":172). Returns a new
// array; the input is not mutated.
function normalizeRoleIds(roles) {
  return (roles || []).map((role, index) => ({ ...role, id: `r${index + 1}` }));
}

function capabilitiesOf(qbit) {
  if (qbit && Array.isArray(qbit.capabilities)) return qbit.capabilities;
  return deriveCapabilities(qbit);
}

function hasPlainTextOnly(value) {
  return (
    typeof value === 'string' &&
    !/[<>@]/.test(value) &&
    !/http/i.test(value) &&
    !/www/i.test(value)
  );
}

function fail(reason) {
  return { ok: false, reason };
}

// validateRoleShape(role, index): id/name/req-or-reqAll checks shared by the
// available-mode validator and the Invent validator. Exactly one of req
// (ANY-of) and reqAll (ALL-of) must be present as a non-empty vocab tag list.
function validateRoleShape(role, index) {
  if (!role || typeof role !== 'object') {
    return fail(`role ${index} must be an object`);
  }
  const idOk =
    (typeof role.id === 'string' && role.id.length > 0) ||
    (typeof role.id === 'number' && Number.isFinite(role.id));
  if (!idOk) {
    return fail(`role ${index} must have an id`);
  }
  if (typeof role.name !== 'string' || role.name.length < 1 || role.name.length > MAX_ROLE_NAME_LEN) {
    return fail(`role ${index} name must be 1-40 characters`);
  }
  if (!hasPlainTextOnly(role.name)) {
    return fail(`role ${index} name must be plain text (no < > links or @)`);
  }
  const roleBanned = containsBannedWord(role.name);
  if (roleBanned) {
    return fail(`role ${index} name contains banned word: ${roleBanned}`);
  }
  const hasReq = Array.isArray(role.req) && role.req.length > 0;
  const hasReqAll = Array.isArray(role.reqAll) && role.reqAll.length > 0;
  if (hasReq === hasReqAll) {
    return fail(`role ${index} must have exactly one of req or reqAll (non-empty)`);
  }
  const tags = hasReqAll ? role.reqAll : role.req;
  for (const tag of tags) {
    if (!CAPABILITY_VOCAB.includes(tag)) {
      return fail(`role ${index} has unknown capability tag: ${String(tag)}`);
    }
  }
  return { ok: true };
}

function validateChallengeText(challenge) {
  if (!challenge || typeof challenge !== 'object') {
    return fail('challenge must be an object');
  }
  if (typeof challenge.title !== 'string' || challenge.title.length < 1 || challenge.title.length > MAX_TITLE_LEN) {
    return fail('title must be 1-60 characters');
  }
  if (!hasPlainTextOnly(challenge.title)) {
    return fail('title must be plain text (no < > links or @)');
  }
  const titleBanned = containsBannedWord(challenge.title);
  if (titleBanned) {
    return fail(`title contains banned word: ${titleBanned}`);
  }
  if (typeof challenge.brief !== 'string' || challenge.brief.length < 1 || challenge.brief.length > MAX_BRIEF_LEN) {
    return fail('brief must be 1-240 characters');
  }
  if (!hasPlainTextOnly(challenge.brief)) {
    return fail('brief must be plain text (no < > links or @)');
  }
  const briefBanned = containsBannedWord(challenge.brief);
  if (briefBanned) {
    return fail(`brief contains banned word: ${briefBanned}`);
  }
  if (!Array.isArray(challenge.roles) || challenge.roles.length !== 2) {
    return fail('challenge must have exactly 2 roles');
  }
  for (let i = 0; i < challenge.roles.length; i++) {
    const verdict = validateRoleShape(challenge.roles[i], i);
    if (!verdict.ok) return verdict;
  }
  return { ok: true };
}

function validateChallenge(challenge, candidates) {
  const textVerdict = validateChallengeText(challenge);
  if (!textVerdict.ok) return textVerdict;
  if (!Array.isArray(candidates) || candidates.length < 2) {
    return fail('need at least 2 candidates to solve a challenge');
  }
  // Solvable by two DISTINCT candidates: check all ordered pairs, both
  // role orientations, req ANY-of / reqAll ALL-of per role.
  const [roleA, roleB] = challenge.roles;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = 0; j < candidates.length; j++) {
      if (i === j) continue;
      const capsI = capabilitiesOf(candidates[i]);
      const capsJ = capabilitiesOf(candidates[j]);
      if (roleSatisfiedBy(roleA, capsI) && roleSatisfiedBy(roleB, capsJ)) {
        return { ok: true };
      }
    }
  }
  return fail('no two distinct candidates can fill both roles');
}

// isForgeableCombo(tags): true when the tag list is exactly one boost's full
// tag-set plus 1-2 fix tags, i.e. a player can forge a Qbit carrying all of
// them (one boost choice plus fix picks). Order-insensitive, duplicates fatal.
function isForgeableCombo(tags) {
  if (!Array.isArray(tags) || tags.length < 2) return false;
  const unique = [...new Set(tags)];
  if (unique.length !== tags.length) return false;
  if (!unique.every((tag) => CAPABILITY_VOCAB.includes(tag))) return false;
  const fixTags = Object.values(FIX_TAG_MAP);
  for (const boostTags of Object.values(BOOST_TAG_MAP)) {
    if (!boostTags.every((tag) => unique.includes(tag))) continue;
    const rest = unique.filter((tag) => !boostTags.includes(tag));
    if (rest.length >= 1 && rest.length <= 2 && rest.every((tag) => fixTags.includes(tag))) {
      return true;
    }
  }
  return false;
}

// validateInventChallenge(challenge, candidates): the Invent proof. Exactly
// one role (the invent role) must be forgeable AND held by no pool candidate;
// the other role must be solvable from the pool by at least one candidate.
// Text/shape checks are the same as validateChallenge.
function validateInventChallenge(challenge, candidates) {
  const textVerdict = validateChallengeText(challenge);
  if (!textVerdict.ok) return textVerdict;
  if (!Array.isArray(candidates) || candidates.length < 1) {
    return fail('need at least 1 candidate to anchor an Invent challenge');
  }
  const [roleA, roleB] = challenge.roles;
  const aInvent = Array.isArray(roleA.reqAll) && isForgeableCombo(roleA.reqAll);
  const bInvent = Array.isArray(roleB.reqAll) && isForgeableCombo(roleB.reqAll);
  if (aInvent === bInvent) {
    return fail('Invent challenge must have exactly one forgeable reqAll role');
  }
  const inventRole = aInvent ? roleA : roleB;
  const otherRole = aInvent ? roleB : roleA;
  for (const candidate of candidates) {
    if (roleSatisfiedBy(inventRole, capabilitiesOf(candidate))) {
      return fail('Invent role is already solvable from the pool');
    }
  }
  const anchored = candidates.some((candidate) =>
    roleSatisfiedBy(otherRole, capabilitiesOf(candidate))
  );
  if (!anchored) {
    return fail('Invent anchor role is not solvable from the pool');
  }
  return { ok: true };
}

// rolesMatchRequired(roles, required): true when the two role tag-specs equal
// the required specs in either orientation. Compares the requirement key
// (req vs reqAll) and the tag SET, so model reordering is harmless but any
// added, dropped, or renamed tag fails.
function roleSpecKey(role) {
  if (Array.isArray(role.reqAll)) return `all:${[...role.reqAll].sort().join('+')}`;
  if (Array.isArray(role.req)) return `any:${[...role.req].sort().join('+')}`;
  return 'none';
}

function rolesMatchRequired(roles, required) {
  if (!Array.isArray(roles) || roles.length !== 2) return false;
  if (!Array.isArray(required) || required.length !== 2) return false;
  const got = [roleSpecKey(roles[0]), roleSpecKey(roles[1])].sort().join('|');
  const want = [roleSpecKey(required[0]), roleSpecKey(required[1])].sort().join('|');
  return got !== 'none' && got === want;
}

function checkSolution(roles, assignedQbits) {
  if (!Array.isArray(roles) || roles.length === 0) return false;
  let assigned;
  if (Array.isArray(assignedQbits)) {
    assigned = assignedQbits;
  } else if (assignedQbits && typeof assignedQbits === 'object') {
    assigned = roles.map((role) => assignedQbits[role && role.id]);
  } else {
    return false;
  }
  if (!Array.isArray(assigned) || assigned.length !== roles.length) return false;
  const seenIds = new Set();
  const seenRefs = new Set();
  for (let k = 0; k < roles.length; k++) {
    const role = roles[k];
    const qbit = assigned[k];
    if (!role || typeof role !== 'object') return false;
    if (!qbit || typeof qbit !== 'object') return false;
    if (qbit.id !== undefined && qbit.id !== null) {
      const key = `${typeof qbit.id}:${String(qbit.id)}`;
      if (seenIds.has(key)) return false;
      seenIds.add(key);
    } else {
      if (seenRefs.has(qbit)) return false;
      seenRefs.add(qbit);
    }
    if (!roleSatisfiedBy(role, capabilitiesOf(qbit))) return false;
  }
  return true;
}

function sanitizeCandidateName(name) {
  const cleaned = String(name === undefined || name === null ? '' : name)
    .replace(/[^\p{L}\p{N} \-]/gu, '')
    .trim()
    .slice(0, MAX_CANDIDATE_NAME_LEN)
    .trim();
  return cleaned || 'Unnamed Qbit';
}

function toCandidate(row, owner) {
  if (!row || typeof row !== 'object') return null;
  if (row.id === undefined || row.id === null || String(row.id).length === 0) return null;
  return {
    id: row.id,
    name: sanitizeCandidateName(row.name),
    owner,
    capabilities: deriveCapabilities(row),
  };
}

function selectCandidates(ownQbits, publicQbits, limit = 12) {
  const n = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 12;
  const own = (Array.isArray(ownQbits) ? ownQbits : [])
    .map((row) => toCandidate(row, 'own'))
    .filter(Boolean);
  const community = (Array.isArray(publicQbits) ? publicQbits : [])
    .map((row) => toCandidate(row, 'community'))
    .filter(Boolean);
  // Interleave own and community so both are represented when both exist.
  const mixed = [];
  let i = 0;
  let j = 0;
  while (mixed.length < n && (i < own.length || j < community.length)) {
    if (i < own.length && mixed.length < n) mixed.push(own[i++]);
    if (j < community.length && mixed.length < n) mixed.push(community[j++]);
  }
  return mixed;
}

// levelForResults(results): adaptive difficulty from the player's last 5
// results (each {passed:boolean}, any order — the caller passes the latest).
// Start at 1; 3+ wins lift one level; 2+ fails drop one level; range 1-3.
// Level 3 needs a dominant window (5 wins from 5): the spec's up/down rules
// alone only span 1-2, so a perfect window is the documented step to 3.
function levelForResults(results) {
  const last = Array.isArray(results) ? results.slice(-5) : [];
  let wins = 0;
  let fails = 0;
  for (const row of last) {
    if (!row || typeof row.passed !== 'boolean') continue;
    if (row.passed) wins += 1;
    else fails += 1;
  }
  let level = 1;
  if (wins >= 5) level = 3;
  else if (wins >= 3) level = 2;
  if (fails >= 2) level -= 1;
  if (level < 1) level = 1;
  if (level > 3) level = 3;
  return level;
}

const BOOST_TAGS = ['phase-lock', 'ground', 'entangle', 'tunnel', 'hybrid'];
const FIX_TAGS = ['superposition', 'phase-control', 'collapse'];

// buildAvailablePlan(candidates): level-2 role tags — one reqAll of one boost
// tag + one fix tag plus one single-tag req, solvable by two distinct pool
// candidates. Deterministic first-fit in pool order; null when impossible.
function buildAvailablePlan(candidates) {
  const pool = Array.isArray(candidates) ? candidates : [];
  if (pool.length < 2) return null;
  for (const holder of pool) {
    const caps = capabilitiesOf(holder);
    const boostTags = BOOST_TAGS.filter((tag) => caps.includes(tag));
    const fixTags = FIX_TAGS.filter((tag) => caps.includes(tag));
    for (const boostTag of boostTags) {
      for (const fixTag of fixTags) {
        const combo = { id: 'r1', name: 'Dual Anchor', reqAll: [boostTag, fixTag] };
        for (const anchor of CAPABILITY_VOCAB) {
          const other = { id: 'r2', name: 'Relay Stabilizer', req: [anchor] };
          const verdict = validateChallenge(
            { title: 'plan probe', brief: 'plan probe', roles: [combo, other] },
            pool
          );
          if (verdict.ok) {
            return { difficulty: 2, mode: 'available', roles: [combo, other] };
          }
        }
      }
    }
  }
  return null;
}

// buildInventPlan(candidates): level-3 role tags — one forgeable reqAll combo
// (one boost tag-set + 1-2 fix tags) that NO pool candidate holds, plus one
// single-tag req solvable from the pool. Deterministic first-fit; the solver
// (validateInventChallenge) proves both halves. Null when impossible.
function buildInventPlan(candidates) {
  const pool = Array.isArray(candidates) ? candidates : [];
  if (pool.length < 1) return null;
  const fixSubsets = [
    ['superposition'],
    ['phase-control'],
    ['collapse'],
    ['superposition', 'phase-control'],
    ['superposition', 'collapse'],
    ['phase-control', 'collapse'],
  ];
  for (const boostTags of Object.values(BOOST_TAG_MAP)) {
    for (const fixTags of fixSubsets) {
      const combo = [...boostTags, ...fixTags];
      const held = pool.some((candidate) => {
        const caps = capabilitiesOf(candidate);
        return combo.every((tag) => caps.includes(tag));
      });
      if (held) continue;
      for (const anchor of CAPABILITY_VOCAB) {
        const invent = { id: 'r1', name: 'Unmapped Response', reqAll: combo };
        const other = { id: 'r2', name: 'Anchor Relay', req: [anchor] };
        const verdict = validateInventChallenge(
          { title: 'plan probe', brief: 'plan probe', roles: [invent, other] },
          pool
        );
        if (verdict.ok) {
          return { difficulty: 3, mode: 'invent', roles: [invent, other] };
        }
      }
    }
  }
  return null;
}

module.exports = {
  CAPABILITY_VOCAB,
  BOOST_TAG_MAP,
  FIX_TAG_MAP,
  TAG_PHRASES,
  needsTextForRole,
  BANNED_WORDS,
  containsBannedWord,
  normalizeRoleIds,
  deriveCapabilities,
  roleSatisfiedBy,
  validateRoleShape,
  validateChallenge,
  validateInventChallenge,
  rolesMatchRequired,
  isForgeableCombo,
  checkSolution,
  selectCandidates,
  levelForResults,
  buildAvailablePlan,
  buildInventPlan,
};
