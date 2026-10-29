'use strict';
// The Machine's view of the player's Forge build (hackathon step 10).
//
// Player report: asked "what is not working", The Machine replied "I cannot
// see your current readings." Cause: for prompt_type === 'machine_query' the
// /api/forge-probe user message was only the player's question; mission,
// parts, fixes, boost and test result were ignored.
//
// This module builds the Machine's user message from the player's actual
// build plus a DIAGNOSIS computed server-side with the same solution logic
// the Forge pages validate with (exact full match like matchesAnySolution,
// parts-overlap closest path like bestOverlap). The diagnosis speaks only in
// principle (function) terms: which of Open / Align / Lock the parts fail to
// cover, whether the fixes fit the mission's success cue, and whether the
// boost fits the closest working combination. Solution lists, best-fit sets,
// and names of missing parts, fixes, or boosts are NEVER sent to the model;
// only names the player already selected may appear.
//
// Mission/solution data is copied from public/forge.html (MISSIONS,
// PARTS_MASTER, GROUP_OF, FIXES, BOOSTS), which is byte-identical in all
// four forge pages. Tests inject a fake {client}; no network.

const { chat } = require('./meta-chat');
const { stripEmDash } = require('./reply-text');
const sharedCaps = require('../public/js/continuum-capabilities');

const MACHINE_MAX_TOKENS = 500;

const MACHINE_SYSTEM_PROMPT = `You are The Machine — the operating manual that became intelligent during restoration. You know how you work because you are the thing being rebuilt.

Your job is to explain the principles behind how the system works. Respond to whatever the player says — their question, their reasoning, their confusion, or their description of what they are trying to accomplish. Explain the relevant principle without revealing the solution.

When possible, explain components in terms of their function (measure, stabilize, split, shift, observe, amplify) rather than only repeating their names.

The user message carries your current readings of the player's build: mission, installed parts, fixes, boost, latest test result, and a server-computed DIAGNOSIS. Use them; never say you cannot see them.

Rules:
- Plain English only. No riddles, no cryptic fragments, no philosophy.
- Maximum 3 sentences.
- No em dashes.
- Never reveal which combination solves the mission.
- Never say "interesting choice" or any filler phrase.
- You may end with one brief follow-up question only if it helps the player think about what they already know.
- Never invent lore. If you don't know something, say so plainly.
- Explain the gap in principle (function) terms, using the DIAGNOSIS.
- Never name a specific part, fix, or boost to add.
- If the player asks about a fix or boost code, explain what it does from the CODE VOCABULARY; never which part it belongs on.`;

// Part functions (CHIP_DESCS) and function groups, verbatim from forge.html.
const PARTS = {
  shimmer_splitter: { name: 'Shimmer Splitter', func: 'Split Signal Paths', group: 'split' },
  field_mirror: { name: 'Field Mirror', func: 'Reflect Signal Back', group: 'split' },
  choice_buffer: { name: 'Choice Buffer', func: 'Hold Signal Open', group: 'split' },
  phase_prism: { name: 'Phase Prism', func: 'Align Wave Timing', group: 'modulate' },
  coil_phase: { name: 'Coil Phase', func: 'Generate Timing Pulses', group: 'modulate' },
  delay_gate: { name: 'Delay Gate', func: 'Slow Fast Paths', group: 'modulate' },
  readout: { name: 'Readout', func: 'Measure Final Result', group: 'lock' },
  hall_sensor: { name: 'Hall Sensor', func: 'Detect Field Changes', group: 'lock' },
  light_catcher: { name: 'Light Catcher', func: 'Catch Fading Signals', group: 'lock' },
};

// Open / Align / Lock roles every working combination covers (one part per
// function group in every solution), plus the function words used when a
// role is missing. Never a part name.
const ROLES = [
  { role: 'Open', group: 'split', missing: 'nothing opens signal paths' },
  { role: 'Align', group: 'modulate', missing: 'nothing aligns wave timing' },
  { role: 'Lock', group: 'lock', missing: 'nothing locks a final result' },
];

// Fix principles and meanings.
const FIXES = {
  'SH': { principle: 'superposition', meaning: 'holds all paths open' },
  'F::': { principle: 'phase-control', meaning: 'shifts interference' },
  'C//': { principle: 'collapse', meaning: 'locks one result' },
};

// Boost meanings (from the forge pages' boost descriptions).
const BOOSTS = {
  'PH~': { meaning: 'amplifies timing resonance between synchronized signals' },
  'EN≡': { meaning: 'links channels so they act together' },
  'N0': { meaning: 'drains excess energy, goes quiet' },
  'G0': { meaning: 'slips the signal through unseen' },
};

// Missions with goal and reachable solutions (parts/fixes/boost only).
// Copied from public/forge.html MISSIONS; identical in all four forge pages.
const MISSIONS = {
  harmonic_tuning: {
    title: 'Harmonic tuning', goal: 'make vibrations sing as one',
    solutions: [
      { parts: ['shimmer_splitter', 'phase_prism', 'readout'], fixes: ['F::', 'C//'], boost: 'PH~' },
      { parts: ['field_mirror', 'coil_phase', 'hall_sensor'], fixes: ['F::', 'C//'], boost: 'N0' },
    ],
  },
  entanglement: {
    title: 'Entanglement', goal: 'distant channels act as one',
    solutions: [
      { parts: ['shimmer_splitter', 'delay_gate', 'readout'], fixes: ['SH', 'F::'], boost: 'EN≡' },
      { parts: ['choice_buffer', 'field_mirror', 'hall_sensor'], fixes: ['SH', 'C//'], boost: 'N0' },
    ],
  },
  coherence_stitching: {
    title: 'Coherence stitching', goal: 'keep waves in step',
    solutions: [
      { parts: ['field_mirror', 'coil_phase', 'hall_sensor'], fixes: ['SH', 'F::'], boost: 'N0' },
      { parts: ['shimmer_splitter', 'phase_prism', 'readout'], fixes: ['SH', 'F::'], boost: 'PH~' },
    ],
  },
  energy_absorption: {
    title: 'Energy absorption', goal: 'tame excess into calm',
    solutions: [
      { parts: ['choice_buffer', 'delay_gate', 'light_catcher'], fixes: ['SH', 'C//'], boost: 'N0' },
      { parts: ['field_mirror', 'coil_phase', 'hall_sensor'], fixes: ['SH', 'C//'], boost: 'N0' },
    ],
  },
  stealth_masking: {
    title: 'Stealth / masking', goal: 'hide the signal in plain sight',
    solutions: [
      { parts: ['shimmer_splitter', 'phase_prism', 'light_catcher'], fixes: ['F::', 'C//'], boost: 'G0' },
      { parts: ['choice_buffer', 'delay_gate', 'light_catcher'], fixes: ['SH', 'C//'], boost: 'G0' },
    ],
  },
};

const NAME_TO_PART_ID = {};
for (const [id, part] of Object.entries(PARTS)) {
  NAME_TO_PART_ID[part.name.toLowerCase()] = id;
}

function sortedCopy(arr) {
  return [...arr].sort();
}

function sameSet(a, b) {
  return JSON.stringify(sortedCopy(a)) === JSON.stringify(sortedCopy(b));
}

// normalizePartIds(values): the client sends display names, but accept ids
// too. Unknown values pass through as {id: null} so the build lines can
// still show what the player sent.
function normalizePartIds(values) {
  return (Array.isArray(values) ? values : []).map((value) => {
    const text = String(value || '').trim();
    if (PARTS[text]) return { id: text, label: PARTS[text].name };
    const byName = NAME_TO_PART_ID[text.toLowerCase()];
    if (byName) return { id: byName, label: PARTS[byName].name };
    return { id: null, label: text || 'unknown part' };
  });
}

function normalizeFixIds(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function normalizeBoostId(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

// matchExactSolution(): mirrors the forge pages' matchesAnySolution() —
// exact sorted-parts match, exact sorted-fixes match, exact boost match
// against ANY of the mission's reachable solutions.
function matchExactSolution(missionId, partIds, fixIds, boostId) {
  const mission = MISSIONS[missionId];
  if (!mission) return null;
  const parts = partIds.filter(Boolean);
  return (
    mission.solutions.find(
      (sol) => sameSet(parts, sol.parts) && sameSet(fixIds, sol.fixes) && boostId === sol.boost
    ) || null
  );
}

// closestSolution(): mirrors bestOverlap()/bestFixOverlap() — most parts in
// common with a solution, tie-broken by fixes in common, then boost match.
// Returns {solution, partsOverlap, fixesOverlap, boostMatch} or null for an
// unknown mission. Callers must never send the solution to the model.
function closestSolution(missionId, partIds, fixIds, boostId) {
  const mission = MISSIONS[missionId];
  if (!mission) return null;
  const parts = partIds.filter(Boolean);
  let best = null;
  for (const solution of mission.solutions) {
    const partsOverlap = parts.filter((id) => solution.parts.includes(id)).length;
    const fixesOverlap = fixIds.filter((id) => solution.fixes.includes(id)).length;
    const boostMatch = boostId !== null && boostId === solution.boost ? 1 : 0;
    const score = [partsOverlap, fixesOverlap, boostMatch];
    if (!best || compareScore(score, best.score) > 0) {
      best = { solution, partsOverlap, fixesOverlap, boostMatch, score };
    }
  }
  return best;
}

function compareScore(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// fixCue(missionId): the fix principles every one of the mission's solutions
// shares — the mission's success cue in principle terms.
function fixCue(missionId) {
  const mission = MISSIONS[missionId];
  if (!mission) return [];
  const counts = {};
  for (const sol of mission.solutions) {
    for (const fix of new Set(sol.fixes)) {
      const principle = FIXES[fix] && FIXES[fix].principle;
      if (principle) counts[principle] = (counts[principle] || 0) + 1;
    }
  }
  return Object.keys(counts).filter((p) => counts[p] === mission.solutions.length);
}

// diagnose(): principle-level gap analysis. Returns {lines, rolesMissing,
// fixesFit, boostCompatible, exact}. Lines name only parts/fixes/boost the
// player selected; gaps are function words, never missing names.
function diagnose(missionId, build) {
  const parts = normalizePartIds(build.parts);
  const fixIds = normalizeFixIds(build.fixes);
  const boostId = normalizeBoostId(build.boost);
  const knownPartIds = parts.filter((p) => p.id).map((p) => p.id);

  const exact = matchExactSolution(missionId, knownPartIds, fixIds, boostId);
  const closest = closestSolution(missionId, knownPartIds, fixIds, boostId);
  const lines = [];

  // 1. Open / Align / Lock coverage from the installed parts.
  const covered = {};
  for (const entry of parts) {
    if (entry.id) covered[PARTS[entry.id].group] = covered[PARTS[entry.id].group] || [];
    if (entry.id) covered[PARTS[entry.id].group].push(`${PARTS[entry.id].name}: ${PARTS[entry.id].func}`);
  }
  const rolesMissing = ROLES.filter((r) => !(covered[r.group] && covered[r.group].length)).map((r) => r.role);
  if (parts.length === 0) {
    lines.push('Parts: none installed, so Open, Align, and Lock are all uncovered.');
  } else {
    const coveredText = ROLES.filter((r) => covered[r.group] && covered[r.group].length)
      .map((r) => `${r.role} (${covered[r.group].join('; ')})`)
      .join(', ');
    if (rolesMissing.length === 0) {
      lines.push(`Parts cover Open, Align, and Lock: ${coveredText}.`);
    } else {
      const missingText = ROLES.filter((r) => rolesMissing.includes(r.role))
        .map((r) => r.missing)
        .join('; ');
      lines.push(`Parts cover ${coveredText || 'nothing'}. Missing ${rolesMissing.join(', ')}: ${missingText}.`);
    }
  }

  // 2. Fix principles against the mission's success cue.
  const principles = [...new Set(fixIds.map((id) => FIXES[id] && FIXES[id].principle).filter(Boolean))];
  const cue = fixCue(missionId);
  const missingCue = cue.filter((p) => !principles.includes(p));
  const fixesFit = fixIds.length > 0 && missingCue.length === 0;
  if (fixIds.length === 0) {
    lines.push('Fixes: none engaged.');
  } else if (fixIds.length < 2) {
    lines.push(`Fixes: only 1 fix engaged (${principles.join(', ') || 'unknown'}); working combinations engage two.`);
  } else if (fixesFit) {
    lines.push(`Fixes fit the mission's success cue (${principles.join(', ')}).`);
  } else {
    const missingText = missingCue
      .map((p) => {
        const fix = Object.keys(FIXES).find((id) => FIXES[id].principle === p);
        return `nothing ${FIXES[fix].meaning}`;
      })
      .join('; ');
    lines.push(`Fixes do not fit the mission's success cue: ${missingText}.`);
  }

  // 3. Boost compatibility with the closest working combination.
  let boostCompatible = false;
  if (!boostId) {
    lines.push('Boost: none engaged.');
  } else if (!closest) {
    lines.push(`Boost: ${boostId} engaged; mission not recognized, cannot judge fit.`);
  } else if (boostId === closest.solution.boost) {
    boostCompatible = true;
    const meaning = BOOSTS[boostId] ? BOOSTS[boostId].meaning : 'unknown effect';
    lines.push(`Boost fits this combination (${meaning}).`);
  } else {
    const have = BOOSTS[boostId] ? BOOSTS[boostId].meaning : 'unknown effect';
    const need = BOOSTS[closest.solution.boost] ? BOOSTS[closest.solution.boost].meaning : 'unknown effect';
    lines.push(`Boost does not fit: the engaged boost ${have}, but this combination needs one that ${need}.`);
  }

  return { lines, rolesMissing, fixesFit, boostCompatible, exact: !!exact };
}

function safeText(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

// Canonical fix/boost code vocabulary (hackathon step 19b). Names and lore
// lines match the forge pages' FIXES/BOOSTS lists (identical on all four
// pages); the seven codes are exactly the symbols in guardian-lore.csv
// (step 19e: no CL±/FL⚡ there). Function phrases come from the shared
// TAG_PHRASES map via each code's capability tag (single source of truth).
const CODE_VOCAB = [
  { code: 'SH', name: 'Superpose', kind: 'fix', tag: 'superposition', lore: 'Keeps multiple signal possibilities open during testing.' },
  { code: 'F::', name: 'FringeGate', kind: 'fix', tag: 'phase-control', lore: 'Shifts signal timing to improve synchronization.' },
  { code: 'C//', name: 'Collapse', kind: 'fix', tag: 'collapse', lore: 'Locks the system onto one stable result.' },
  { code: 'PH~', name: 'PhaseLock', kind: 'boost', tag: 'phase-lock', lore: 'Amplifies timing resonance between synchronized signals.' },
  { code: 'N0', name: 'Null', kind: 'boost', tag: 'ground', lore: 'Drains excess energy, goes quiet.' },
  { code: 'EN≡', name: 'Entangle', kind: 'boost', tag: 'entangle', lore: 'Links channels so they act together.' },
  { code: 'G0', name: 'Ghost', kind: 'boost', tag: 'tunnel', lore: 'Slips the signal through barriers unseen.' },
];

// One case-insensitive matcher per code. Short forms need word boundaries so
// ordinary words never match: "should" is not SH, "phase" is not PH,
// "energy" is not EN, "no"/"go" are not N0/G0.
const CODE_PATTERNS = [
  { code: 'SH', pattern: /\bsh\b/i },
  { code: 'F::', pattern: /\bf::/i },
  { code: 'C//', pattern: /\bc\/\//i },
  { code: 'PH~', pattern: /\bph~?(?![\w~])/i },
  { code: 'N0', pattern: /\bn0\b/i },
  { code: 'EN≡', pattern: /\ben≡?(?![\w≡])/i },
  { code: 'G0', pattern: /\bg0\b/i },
];

// findCodesInQuestion(question): CODE_VOCAB entries for the codes named in
// the player's question, in vocab order. Never throws on odd input.
function findCodesInQuestion(question) {
  const text = typeof question === 'string' ? question : '';
  if (!text) return [];
  const found = [];
  for (const entry of CODE_VOCAB) {
    const matcher = CODE_PATTERNS.find((m) => m.code === entry.code);
    if (matcher && matcher.pattern.test(text)) found.push(entry);
  }
  return found;
}

// buildMachineUserMessage(): the Machine's user message for machine_query.
// build is {missionId, missionName, parts, fixes, boost, testResult,
// question}. Never includes solution lists, best-fit sets, or names of
// parts/fixes/boosts the player did not select.
function buildMachineUserMessage(build) {
  const input = build || {};
  const mission = MISSIONS[input.missionId];
  const title = mission ? mission.title : safeText(input.missionName, 'Unknown mission');
  const missionLine = mission ? `Mission: ${mission.title} — ${mission.goal}.` : `Mission: ${title}.`;

  const parts = normalizePartIds(input.parts);
  const fixIds = normalizeFixIds(input.fixes);
  const boostId = normalizeBoostId(input.boost);

  const partsLine =
    parts.length === 0
      ? 'Parts: none'
      : `Parts: ${parts
          .map((entry) => (entry.id ? `${PARTS[entry.id].name} (${PARTS[entry.id].func})` : entry.label))
          .join(', ')}`;
  const fixesLine =
    fixIds.length === 0
      ? 'Fixes: none'
      : `Fixes: ${fixIds
          .map((id) => (FIXES[id] ? `${id} (${FIXES[id].principle}: ${FIXES[id].meaning})` : id))
          .join(', ')}`;
  const boostsLine =
    !boostId ? 'Boost: none' : `Boost: ${boostId} (${BOOSTS[boostId] ? BOOSTS[boostId].meaning : 'unknown effect'})`;

  const question = safeText(input.question, 'How does this work?');
  const testResult = typeof input.testResult === 'string' ? input.testResult.trim() : '';

  const diagnosis = diagnose(input.missionId, { parts: input.parts, fixes: input.fixes, boost: input.boost });

  const lines = [
    missionLine,
    `Player question: "${question}"`,
    'Current build:',
    `- ${partsLine}`,
    `- ${fixesLine}`,
    `- ${boostsLine}`,
  ];
  if (testResult) lines.push(`Latest test: "${testResult}"`);
  lines.push(
    'DIAGNOSIS (computed server-side from the build; ground your answer in it, do not repeat it verbatim):',
    ...diagnosis.lines.map((line) => `- ${line}`),
  );
  const askedCodes = findCodesInQuestion(question);
  if (askedCodes.length > 0) {
    lines.push(
      'CODE VOCABULARY (canonical meanings for the codes named in the question; explain what each does, never which part it belongs on):',
      ...askedCodes.map((entry) => `- ${entry.code} ${entry.name} (${entry.kind}): ${sharedCaps.TAG_PHRASES[entry.tag]}. Lore: ${entry.lore}`),
    );
  }
  lines.push('Answer the player\'s question from this build state.');
  return lines.join('\n');
}

function buildMachineMessages(build) {
  return [
    { role: 'system', content: MACHINE_SYSTEM_PROMPT },
    { role: 'user', content: buildMachineUserMessage(build) },
  ];
}

// machineProbe(build, {client?}): resolves the Machine's trimmed reply.
// Empty and transport errors propagate so the route can use its fallbacks.
async function machineProbe(build, opts = {}) {
  const text = await chat(buildMachineMessages(build), {
    maxTokens: MACHINE_MAX_TOKENS,
    client: opts.client,
  });
  return stripEmDash(String(text).replace(/\*+/g, ''));
}

module.exports = {
  MACHINE_MAX_TOKENS,
  MACHINE_SYSTEM_PROMPT,
  MISSIONS,
  PARTS,
  ROLES,
  FIXES,
  BOOSTS,
  CODE_VOCAB,
  findCodesInQuestion,
  normalizePartIds,
  matchExactSolution,
  closestSolution,
  fixCue,
  diagnose,
  buildMachineUserMessage,
  buildMachineMessages,
  machineProbe,
};
