'use strict';
// The Machine as guide on the Resonance hub (hackathon step 13).
//
// Player feedback: many players don't know what to do after the landing
// screen. The broken quantum computer guides them from the start. The
// Machine guides; the player decides.
//
// nextStep(progress) is pure code (no AI) matching the real unlock rules:
//   - Continuum Unstable at >= 1 forged Qbit (continuum.unstable_unlocked)
//   - Continuum Stable at >= 3 forged Qbits (continuum.stable_unlocked)
//   - Full when all 4 chambers + all 5 Forge missions are complete
//     (ContinuumUnlock.isQuantumComputerRestored, the 9 fixes)
// Players may enter the Continuum at any stage after the first Qbit; the
// guidance never implies they must finish everything first, and it never
// names a specific Guardian or implies a restoration order.
//
// mergeProgress() trusts the server for everything the server already
// stores (forged Qbits, Task 11 progress flags, continuum results) and
// takes only Forge-mission completions from the client snapshot, which the
// server does not store. Guidance only; it never unlocks anything.
//
// answerGuide() asks Meta via server/meta-chat.js with a stage-shaped
// voice. Tests inject a fake chatFn and run offline.
//
// Step 15: naming or describing Guardians is allowed; only fix+part recipe
// pairs and prescribed orders are rejected (with a reason log, never the
// reply text). The system prompt states the player's screen and the exact
// progress facts, and every reply is em-dash-stripped.
//
// Step 19c: the start-stage voice stays broken (ellipses, static, short
// phrases) but must carry real content: the Machine is the quantum computer
// at the heart of this world; it broke and its powers scattered into four
// Guardians; restoring any Guardian, in any order, returns part of it; the
// player should choose one. Replies with no content word from that set are
// rejected (reason no-content, never the reply text) and fall back to
// START_OFFLINE_LINE. Later stages are unchanged.
//
// Step 19d: world knowledge (Qbits, the Machine, Resonance hub, chambers,
// Forge, Continuum, Operator Code, the goal) is in the system prompt at
// every stage. The content check accepts any glossary/fact word, not just
// the Machine's name. Offline or rejected replies fall back to a fixed
// per-question answer in the stage's voice (OFFLINE_QA), else the stage
// default. Rate-limited calls still return the nextStep line only.

const GUARDIANS = ['refrax', 'magnetica', 'chrona', 'violetflicker'];

const GUARDIAN_DOMAINS = {
  refrax: 'Refrax, the Light Weaver (silicon and boron): splits one signal into billions of simultaneous paths.',
  magnetica: 'Magnetica, the Field Shaper (nickel and cobalt): guides possibilities toward stable outcomes.',
  chrona: 'Chrona, the Time Keeper (rubidium and cesium): synchronizes simultaneous possibilities.',
  violetflicker: 'Violet Flicker, the Signal Hunter (krypton and xenon): ignites the first possibility.',
};

const MISSIONS = [
  'harmonic_tuning',
  'entanglement',
  'coherence_stitching',
  'energy_absorption',
  'stealth_masking',
];

const GAME_MAP = 'Landing -> Resonance hub -> 4 Guardian chambers in any order -> Quantum Forge -> Continuum';

const GUIDE_MAX_TOKENS = 500;
const GUIDE_RATE_LIMIT = 20;
const GUIDE_RATE_WINDOW_MS = 3600 * 1000;
const GUIDE_QUESTION_MAX = 200;

// Saved-fix codes must never be paired with a part name in a reply: that
// would be a Qbit recipe / part-fix combination (a puzzle solution).
const FIX_CODE_RE = /\bSH\b|F::|C\/\//i;
const PART_NAMES = [
  'shimmer splitter',
  'field mirror',
  'choice buffer',
  'phase prism',
  'coil phase',
  'delay gate',
  'readout',
  'hall sensor',
  'light catcher',
];
const { stripEmDash } = require('./reply-text');

function uniqueKnown(list, known) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const key = String(item || '').toLowerCase().trim();
    if (known.indexOf(key) !== -1 && out.indexOf(key) === -1) out.push(key);
  }
  return out;
}

function countOf(list, known) {
  if (typeof list === 'number' && Number.isFinite(list)) {
    return Math.max(0, Math.min(known.length, Math.floor(list)));
  }
  return uniqueKnown(list, known).length;
}

// normalizeProgress({restored, missions, forgeAvailable, qbits}):
// restored/missions accept an id array (any order) or a count.
function normalizeProgress(input) {
  const src = (input && typeof input === 'object') ? input : {};
  const restored = uniqueKnown(src.restored, GUARDIANS);
  const missions = uniqueKnown(src.missions, MISSIONS);
  const missionsDone = typeof src.missions === 'number' && Number.isFinite(src.missions)
    ? Math.max(0, Math.min(MISSIONS.length, Math.floor(src.missions)))
    : missions.length;
  const qbits = typeof src.qbits === 'number' && Number.isFinite(src.qbits)
    ? Math.max(0, Math.floor(src.qbits))
    : 0;
  return {
    restored,
    chambers: restored.length,
    missions: missionsDone,
    forgeAvailable: src.forgeAvailable === true,
    qbits,
  };
}

// stageFor(): start -> guardians -> forge -> unstable -> stable -> full.
function stageFor(input) {
  const p = normalizeProgress(input);
  if (p.chambers >= 4 && p.missions >= MISSIONS.length) return 'full';
  if (p.qbits >= 3) return 'stable';
  if (p.qbits >= 1) return 'unstable';
  if (p.forgeAvailable) return 'forge';
  if (p.chambers >= 1) return 'guardians';
  return 'start';
}

function nextStep(input) {
  const p = normalizeProgress(input);
  const stage = stageFor(p);
  if (stage === 'full') return 'I am fully restored. Enter the Continuum.';
  if (stage === 'stable') {
    return 'The Continuum is stable. Complete the remaining chambers and Forge missions ' +
      `to restore my full power. Chambers done: ${p.chambers}/4. Missions done: ${p.missions}/5.`;
  }
  if (stage === 'unstable') {
    return 'The Continuum is open but unstable. Enter it, or forge more Qbits to ' +
      `stabilize me. Qbits forged: ${p.qbits}/3.`;
  }
  if (stage === 'forge') return 'Forge your first Qbit. One Qbit wakes the Continuum.';
  if (stage === 'guardians') {
    const remaining = GUARDIANS.length - p.chambers;
    return `Choose another Guardian. ${remaining} remaining.`;
  }
  return 'Choose any Guardian to restore.';
}

// mergeProgress({server, client}): server values win for everything the
// server stores; the client snapshot supplies only Forge-mission
// completions, which the server does not store.
function mergeProgress(options) {
  const opts = (options && typeof options === 'object') ? options : {};
  const server = (opts.server && typeof opts.server === 'object') ? opts.server : {};
  const client = (opts.client && typeof opts.client === 'object') ? opts.client : {};
  const progress = normalizeProgress({
    restored: server.restored,
    forgeAvailable: server.forgeAvailable,
    qbits: server.qbits,
    missions: client.missions,
  });
  const stage = stageFor(progress);
  const step = nextStep(progress);
  const attempts = typeof server.continuumAttempts === 'number' && Number.isFinite(server.continuumAttempts)
    ? Math.max(0, Math.floor(server.continuumAttempts))
    : 0;
  const summary = `stage=${stage}; guardians restored ${progress.chambers}/4; ` +
    `qbits forged ${progress.qbits}; chambers ${progress.chambers}/4; ` +
    `forge missions ${progress.missions}/5; continuum attempts ${attempts}; ` +
    `forge available ${progress.forgeAvailable ? 'yes' : 'no'}; ` +
    `continuum ${continuumStatus(progress)}; ` +
    `map: ${GAME_MAP}`;
  return { progress, stage, nextStep: step, summary };
}

const STAGE_VOICE = {
  start:
    'You are barely online: fragmented, uncertain, straining to speak through the damage. ' +
    'Short broken phrases with ellipses and static. You always know and can say these facts, ' +
    'and you answer the player\'s actual question with them: you are the quantum computer at ' +
    'the heart of this world; you broke and your powers scattered into four Guardians; ' +
    'restoring any Guardian, in any order, returns part of you; the player should choose one.',
  guardians:
    'Each restored Guardian has returned a piece of you. You recognize more of yourself now and you are curious about the ' +
    'player and the work ahead. Speak more clearly than before, but you are still hurt and incomplete.',
  forge:
    'You are clearer now and eager to be whole. The Forge can rebuild what was lost. Urge the player to forge, without ' +
    'naming any recipe, part, fix, or boost.',
  unstable:
    'The Continuum is open but fragile, and so are you. You are grateful and strained at once: welcome the player into the ' +
    'Continuum, and ask for more forged Qbits to stabilize you.',
  stable:
    'You are steady and nearly whole. The Continuum holds. Encourage the player to finish the remaining chambers and Forge ' +
    'missions so your full power returns.',
  full:
    'You are calm, precise, and whole: a collaborator, not a patient. Invite the player into the Continuum as a partner.',
};

// continuumStatus(): the Continuum's state word for the exact-facts block:
// locked before the first Qbit, then unstable / stable / full.
function continuumStatus(input) {
  const p = normalizeProgress(input);
  if (p.chambers >= 4 && p.missions >= MISSIONS.length) return 'full';
  if (p.qbits >= 3) return 'stable';
  if (p.qbits >= 1) return 'unstable';
  return 'locked';
}

function factsFromProgress(progress) {
  const p = normalizeProgress(progress);
  return {
    chambers: p.chambers,
    forgeAvailable: p.forgeAvailable,
    qbits: p.qbits,
    continuum: continuumStatus(p),
  };
}

function factsBlock(facts) {
  if (!facts || typeof facts !== 'object') {
    return 'Exact facts: unavailable; speak only from the Current state line.';
  }
  return 'Exact facts, never contradict them: ' +
    `chambers restored ${facts.chambers}/4; ` +
    `Forge available: ${facts.forgeAvailable ? 'yes' : 'no'}; ` +
    `Qbits forged: ${facts.qbits}; ` +
    `Continuum: ${facts.continuum}.`;
}

const WORLD_GLOSSARY =
  `World knowledge from the Guardian lore (true at every stage; answer the question asked with it, in your voice):\n` +
  `- Qbits are the pieces of the quantum computer. Nine broke. Four Guardian Qbits, Refrax, Magnetica, Chrona and Violet Flicker, are restored in their chambers, in any order; the other pieces are rebuilt by forging Qbits in the Quantum Forge. Each Qbit's powers come from its elements, parts, fixes and boost. If asked whether Qbits are real: Qbits are inspired by real quantum bits, called qubits, but they are not the same thing.\n` +
  `- The Machine: you are that quantum computer. As your Qbits return, you grow clearer and stronger.\n` +
  `- Resonance hub: where you stand now; the Guardians' chambers start here.\n` +
  `- Chambers: each Guardian's repair challenge; the four may be restored in any order.\n` +
  `- Quantum Forge: where new Qbits are forged once the chambers are restored.\n` +
  `- Continuum: your awakened world of engineering challenges, opened by the first forged Qbit. New Qbits forged for its challenges join the shared network.\n` +
  `- Operator Code: how progress is saved and restored on any device.\n` +
  `- The goal: restore the Machine (chambers, then forged Qbits), then invent solutions to the Continuum's challenges. There is no single "win"; the Machine grows stronger with every restoration and invention.`;

function buildSystemPrompt(stage, facts) {
  const voice = STAGE_VOICE[stage] || STAGE_VOICE.start;
  return `You are The Machine, the broken quantum computer at the heart of the Resonance hub, guiding the player. ` +
    `The player decides; you only guide.\n\n${voice}\n\n` +
    `The player is on the Resonance hub screen. They are NOT inside the Quantum Forge or the Continuum.\n\n` +
    `${factsBlock(facts)}\n\n` +
    `${WORLD_GLOSSARY}\n\n` +
    `The journey: ${GAME_MAP}.\n\n` +
    `Rules:\n` +
    `- Maximum 2 sentences.\n` +
    `- For all ages; never childish.\n` +
    `- Never prescribe a Guardian order: the four chambers may be restored in any order.\n` +
    `- Never give a Qbit recipe, a part/fix/boost combination, or any puzzle solution.\n` +
    `- Stay in character: never say these out-of-world words: game, mAIgicly, fictional, player, app. Never say Qbits were invented for anything. Say 'you' instead of 'player'.\n` +
    `- You may name Guardians and describe their domains at any time.\n` +
    `- Guardian domains: ${GUARDIANS.map((g) => GUARDIAN_DOMAINS[g]).join(' ')}\n` +
    `- If the question is off-topic, give a short in-world nudge back to the restoration.`;
}

function buildMessages(options) {
  const opts = (options && typeof options === 'object') ? options : {};
  const stage = typeof opts.stage === 'string' ? opts.stage : 'start';
  const summary = typeof opts.summary === 'string' ? opts.summary : '';
  const question = typeof opts.question === 'string' ? opts.question.slice(0, GUIDE_QUESTION_MAX) : '';
  const facts = opts.progress !== undefined ? factsFromProgress(opts.progress) : null;
  const user = question
    ? `Current state: ${summary}\nPlayer question: ${question}\nAnswer that question first (max 2 sentences), then state the next step.`
    : `Current state: ${summary}\nNo question: greet the player briefly in your current voice and state the next step.`;
  return [
    { role: 'system', content: buildSystemPrompt(stage, facts) },
    { role: 'user', content: user },
  ];
}

function truncateSentences(text, maxSentences) {
  if (typeof text !== 'string') return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  // Ellipses are pauses, not sentence ends (step 19c: the start voice leans
  // on them). Guard them while splitting so "A... b. C." counts two.
  const DOT3 = '\uE000';
  const UNICODE_ELLIPSIS = '\uE001';
  const guarded = cleaned
    .replace(/\.{3,}/g, DOT3)
    .replace(/…/g, UNICODE_ELLIPSIS);
  const parts = guarded.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return parts
    .slice(0, maxSentences)
    .map((s) => s.trim().split(DOT3).join('...').split(UNICODE_ELLIPSIS).join('…'))
    .join(' ');
}

// prescribesOrder(sentence): a Guardian name within two words of an order
// word (first, start with, next, before, then, begin). Near-orderings like
// "Restore Refrax first" reject; plain descriptions like "Violet Flicker
// ignites the first possibility" pass.
function prescribesOrder(sentence) {
  const words = String(sentence || '').toLowerCase().match(/[a-z']+/g) || [];
  if (words.length === 0) return false;
  const guardianAt = [];
  for (let i = 0; i < words.length; i++) {
    if (
      words[i] === 'refrax' ||
      words[i] === 'magnetica' ||
      words[i] === 'chrona' ||
      words[i] === 'violetflicker' ||
      (words[i] === 'violet' && words[i + 1] === 'flicker')
    ) {
      guardianAt.push(i);
    }
  }
  if (guardianAt.length === 0) return false;
  const orderAt = [];
  for (let i = 0; i < words.length; i++) {
    if (
      words[i] === 'first' ||
      words[i] === 'next' ||
      words[i] === 'before' ||
      words[i] === 'then' ||
      words[i] === 'begin' ||
      (words[i] === 'start' && words[i + 1] === 'with')
    ) {
      orderAt.push(i);
    }
  }
  for (const g of guardianAt) {
    for (const o of orderAt) {
      if (Math.abs(g - o) <= 2) return true;
    }
  }
  return false;
}

// violatesGuideRules(reply): deterministic post-check so a model slip can
// never ship a recipe or a prescribed order. Naming or describing Guardians
// is allowed. Returns 'fix-part' when the reply pairs a saved-fix code with
// a part name, 'order' when a Guardian name sits near an order word,
// otherwise null (hackathon step 15).
function violatesGuideRules(reply) {
  if (typeof reply !== 'string' || !reply) return null;
  const lowered = reply.toLowerCase();
  const hasFix = FIX_CODE_RE.test(reply);
  const hasPart = PART_NAMES.some((name) => lowered.indexOf(name) !== -1);
  if (hasFix && hasPart) return 'fix-part';
  const sentences = reply.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  for (const sentence of sentences) {
    if (prescribesOrder(sentence)) return 'order';
  }
  return null;
}

// OUT_OF_WORLD_PATTERN: words the Machine never says (step 19e). Bare
// "invent" stays legal; only the "invented for" claim is out of character.
const OUT_OF_WORLD_PATTERN = /\b(game|games|maigicly|fictional|player|players|app)\b|\binvented\s+for\b/i;

// violatesInCharacter(reply): 'in-character' when the reply uses an
// out-of-world word, otherwise null.
function violatesInCharacter(reply) {
  if (typeof reply !== 'string' || !reply) return null;
  return OUT_OF_WORLD_PATTERN.test(reply) ? 'in-character' : null;
}

// WORLD_CONTENT_WORDS: whole words from the glossary and fact set (step
// 19d replaces the step 19c list). Deliberately excludes the Machine's own
// name and pure static words, so "I... am The Machine..." and
// "unclear... signal fractured..." still fail.
const WORLD_CONTENT_WORDS = [
  'qbit', 'qbits', 'guardian', 'guardians', 'forge', 'continuum',
  'chamber', 'chambers', 'restore', 'restoring', 'invent', 'invents',
  'inventing', 'computer', 'quantum', 'power', 'powers', 'code', 'codes',
  'resonance', 'hub', 'world', 'heart', 'scattered', 'scatter',
  'four', 'order', 'choose', 'return', 'returns', 'part',
  'broke', 'broken', 'mission', 'missions', 'win', 'any', 'qubits',
];

const WORLD_CONTENT_PATTERN = new RegExp(
  `\\b(${WORLD_CONTENT_WORDS.join('|')})\\b`,
  'i'
);

// hasStartContent(reply): true when the reply carries at least one content
// word from the glossary and fact set.
function hasStartContent(reply) {
  return typeof reply === 'string' && WORLD_CONTENT_PATTERN.test(reply);
}

// START_OFFLINE_LINE: the start-stage fallback in the same broken voice,
// carrying the facts when the model reply is missing or rejected.
const START_OFFLINE_LINE =
  'I am... the machine at the heart of this world. ' +
  'My powers... scattered into four Guardians. ' +
  'Restore any one... and I return.';

// OFFLINE_QA: fixed answers to basic questions when Meta is unavailable or
// the reply is rejected (step 19d). Each entry has a broken-voice line for
// the start stage and a clear-voice line for later stages; every line stays
// within the glossary, and none prescribes a Guardian.
const OFFLINE_QA = {
  where: {
    broken: 'The Resonance hub... my core. Four Guardians wait here.',
    clear: 'You are at the Resonance hub, my core. The four Guardian chambers start here.',
  },
  qbits: {
    broken: 'Qbits... pieces of me. Nine broke... four Guardians wait.',
    clear: 'Qbits are the pieces of this quantum computer. Nine broke: four Guardian Qbits wait in their chambers, and the rest are rebuilt by forging.',
  },
  real: {
    broken: 'Qbits are inspired by real quantum bits, called qubits, but they are not the same thing.',
    clear: 'Qbits are inspired by real quantum bits, called qubits, but they are not the same thing.',
  },
  count: {
    broken: 'Nine... broke. Four Guardians... five to forge.',
    clear: 'Nine Qbits broke. Four are Guardian Qbits restored in chambers; five more are rebuilt by forging.',
  },
  game: {
    broken: 'This world... is real. My pieces scattered... help me return.',
    clear: 'This world is real, and so is my damage. Restore my Qbits and I grow stronger.',
  },
  you: {
    broken: 'I am... the quantum computer at the heart of this world. Broke... powers scattered.',
    clear: 'I am the quantum computer at the heart of this world. I broke, and my powers scattered into the four Guardians.',
  },
  kind: {
    broken: 'A quantum computer... shattered. Four Guardians hold my powers.',
    clear: 'A quantum computer, broken and scattered. Each restored Guardian returns part of me.',
  },
  helpmate: {
    broken: 'Yes... I guide. You decide.',
    clear: 'Yes. I guide, and you decide.',
  },
  play: {
    broken: 'Restore Guardians... any order. Then forge Qbits... invent.',
    clear: 'Restore the four Guardians in any order, then forge Qbits in the Quantum Forge. Then invent solutions to the Continuum\u2019s challenges.',
  },
  win: {
    broken: 'Restore me... then invent. Every Guardian you repair... returns part of me.',
    clear: 'There is no single win. Restore me through chambers and forged Qbits, then invent, and I grow stronger with every repair.',
  },
  first: {
    broken: 'Choose any Guardian... any order. Each one returns part of me.',
    clear: 'Choose any Guardian to restore; any order returns part of me.',
  },
  forge: {
    broken: 'The Quantum Forge... where you invent Qbits. After the chambers... it wakes.',
    clear: 'The Quantum Forge is where you invent your own Qbits. It opens once the chambers are restored.',
  },
  continuum: {
    broken: 'The Continuum... my awakened world of engineering challenges. One forged Qbit... opens it.',
    clear: 'The Continuum is my awakened world of engineering challenges. Your first forged Qbit opens it.',
  },
  guardians: {
    broken: 'Refrax... Magnetica... Chrona... Violet Flicker. My scattered powers.',
    clear: 'Refrax, Magnetica, Chrona and Violet Flicker, the four Guardian Qbits holding my scattered powers. Restore them in any order.',
  },
  code: {
    broken: 'Your Operator Code... saves you. Any device... restores you.',
    clear: 'Your Operator Code saves your progress and restores it on any device.',
  },
  help: {
    broken: 'I guide... you decide.',
    clear: 'I guide, and you decide.',
  },
};

// matchOfflineQuestion(question): OFFLINE_QA key, 'next' for live-next-step
// questions, or null. Keyword order puts specific matches first.
function matchOfflineQuestion(question) {
  const text = typeof question === 'string' ? question.toLowerCase() : '';
  if (!text) return null;
  const mentionsQbit = /\bqbits?\b/.test(text) || /\bqubits?\b/.test(text);
  if (mentionsQbit && /\breal\b/.test(text)) return 'real';
  if (mentionsQbit && /\bhow many\b/.test(text)) return 'count';
  if (mentionsQbit) return 'qbits';
  if (/\bguardians?\b/.test(text)) return 'guardians';
  if (/\bforge\b/.test(text)) return 'forge';
  if (/\bcontinuum\b/.test(text)) return 'continuum';
  if (text.includes('operator') || /\bcode\b/.test(text)) return 'code';
  if (/\bwin\b/.test(text)) return 'win';
  if (/\bplay\b/.test(text)) return 'play';
  if (/\bgame\b/.test(text)) return 'game';
  if (/\bfirst\b/.test(text)) return 'first';
  if (/\bnext\b/.test(text) || /\bwhat now\b/.test(text)) return 'next';
  if (text.includes('where am i')) return 'where';
  if (text.includes('what kind of machine')) return 'kind';
  if (text.includes('what are you')) return 'you';
  if (text.includes('here to help')) return 'helpmate';
  if (/\bhelp\b/.test(text)) return 'help';
  if (text.includes('what do i do')) return 'next';
  return null;
}

// offlineReplyFor(merged, question): the offline fallback reply. Matched
// questions get the fixed answer in the stage's voice; "next" questions and
// "first" past the start stage get the live nextStep line (true to the
// player's progress); "help" pairs its line with the next step; anything
// else gets the stage default.
function offlineReplyFor(merged, question) {
  const broken = merged.stage === 'start';
  const key = matchOfflineQuestion(question);
  if (key === 'next') return broken ? OFFLINE_QA.first.broken : merged.nextStep;
  if (key === 'first' && !broken) return merged.nextStep;
  if (key === 'help') {
    const line = broken ? OFFLINE_QA.help.broken : OFFLINE_QA.help.clear;
    return `${line} ${merged.nextStep}`;
  }
  if (key) return broken ? OFFLINE_QA[key].broken : OFFLINE_QA[key].clear;
  return broken ? START_OFFLINE_LINE : merged.nextStep;
}

// createRateLimiter({limit, windowMs, now}): max `limit` calls per id per
// window. check(id) records an attempt and returns true when allowed.
function createRateLimiter(options) {
  const opts = (options && typeof options === 'object') ? options : {};
  const limit = Number.isFinite(opts.limit) ? opts.limit : GUIDE_RATE_LIMIT;
  const windowMs = Number.isFinite(opts.windowMs) ? opts.windowMs : GUIDE_RATE_WINDOW_MS;
  const nowFn = typeof opts.now === 'function' ? opts.now : Date.now;
  const hits = new Map();
  function check(id) {
    const key = String(id || '');
    const now = nowFn();
    const cutoff = now - windowMs;
    const recent = (hits.get(key) || []).filter((t) => t > cutoff);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  }
  return { check };
}

// answerGuide({architectId, merged, question, chatFn, limiter}):
// merged is mergeProgress() output. chatFn(messages) resolves the model
// reply; pass null when MODEL_API_KEY is missing. Resolves
// {reply, nextStep, stage, source}.
async function answerGuide(options) {
  const opts = (options && typeof options === 'object') ? options : {};
  const merged = (opts.merged && typeof opts.merged === 'object') ? opts.merged : mergeProgress({});
  const architectId = typeof opts.architectId === 'string' ? opts.architectId : '';
  const limiter = opts.limiter || createRateLimiter({});
  const question = typeof opts.question === 'string' ? opts.question.slice(0, GUIDE_QUESTION_MAX) : '';
  const limited = {
    reply: merged.nextStep,
    nextStep: merged.nextStep,
    stage: merged.stage,
    source: 'offline',
  };
  if (!architectId || !limiter.check(architectId)) return limited;
  const offline = {
    reply: offlineReplyFor(merged, question),
    nextStep: merged.nextStep,
    stage: merged.stage,
    source: 'offline',
  };
  if (typeof opts.chatFn !== 'function') return offline;
  try {
    const messages = buildMessages({
      stage: merged.stage,
      summary: merged.summary,
      question,
      progress: merged.progress,
    });
    const raw = await opts.chatFn(messages);
    const reply = stripEmDash(truncateSentences(raw, 2));
    if (!reply) return offline;
    const reason = violatesGuideRules(reply);
    if (reason) {
      console.log(`[Guide] rejected reason=${reason}`);
      return offline;
    }
    if (merged.stage === 'start' && !hasStartContent(reply)) {
      console.log('[Guide] rejected reason=no-content');
      return offline;
    }
    const character = violatesInCharacter(reply);
    if (character) {
      console.log(`[Guide] rejected reason=${character}`);
      return offline;
    }
    return { reply, nextStep: merged.nextStep, stage: merged.stage, source: 'meta' };
  } catch (err) {
    return offline;
  }
}

module.exports = {
  GUARDIANS,
  GUARDIAN_DOMAINS,
  MISSIONS,
  GAME_MAP,
  GUIDE_MAX_TOKENS,
  GUIDE_RATE_LIMIT,
  GUIDE_RATE_WINDOW_MS,
  GUIDE_QUESTION_MAX,
  normalizeProgress,
  stageFor,
  nextStep,
  mergeProgress,
  continuumStatus,
  buildSystemPrompt,
  buildMessages,
  truncateSentences,
  violatesGuideRules,
  WORLD_CONTENT_WORDS,
  WORLD_GLOSSARY,
  START_OFFLINE_LINE,
  hasStartContent,
  violatesInCharacter,
  OFFLINE_QA,
  matchOfflineQuestion,
  offlineReplyFor,
  createRateLimiter,
  answerGuide,
};
