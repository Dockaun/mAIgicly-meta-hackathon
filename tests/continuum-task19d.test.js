'use strict';
// Hackathon step 19d: the Machine answers a new player's basic questions.
// World knowledge (Qbits, Machine, Resonance hub, chambers, Forge, Continuum,
// Operator Code, goal) is in the system prompt at every stage; the start
// content check accepts any glossary/fact word (not just the Machine's name);
// offline or rejected replies fall back to a fixed per-question answer in the
// stage's voice, else the next-step line. Fix+part and order guards unchanged.
// (node:test + node:assert only). No network, no PGlite.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const guide = require('../server/guide');

const QUESTIONS = [
  'where am I?',
  'what are qbits?',
  'what are you?',
  'what kind of machine are you?',
  'are you here to help?',
  'how do I play?',
  'how do I play this game?',
  'how do I win?',
  'what do I do first?',
  'what do I do next?',
  'what is the forge?',
  'what is the continuum?',
  'who are the Guardians?',
  'what is my operator code for?',
  'help',
];

// Distinctive marker each offline answer must contain: [start, later].
const EXPECTED = {
  'where am I?': ['Resonance hub', 'Resonance hub'],
  'what are qbits?': ['Qbits', 'Qbits'],
  'what are you?': ['quantum computer', 'quantum computer'],
  'what kind of machine are you?': ['quantum computer', 'quantum computer'],
  'are you here to help?': ['I guide', 'I guide'],
  'how do I play?': ['Restore', 'Restore'],
  'how do I play this game?': ['Restore', 'Restore'],
  'how do I win?': ['invent', 'invent'],
  'what do I do first?': ['any order', 'stable'],
  'what do I do next?': ['any order', 'stable'],
  'what is the forge?': ['Forge', 'Forge'],
  'what is the continuum?': ['Continuum', 'Continuum'],
  'who are the Guardians?': ['Refrax', 'Refrax'],
  'what is my operator code for?': ['Operator Code', 'Operator Code'],
  'help': ['I guide', 'I guide'],
};

const START = () => guide.mergeProgress({ server: {}, client: {} });
const STABLE = () => guide.mergeProgress({
  server: { restored: ['refrax', 'magnetica'], forgeAvailable: true, qbits: 3 },
  client: {},
});

const askOffline = (merged, question) => guide.answerGuide({
  architectId: 'arch-19d', merged, question,
  limiter: guide.createRateLimiter({}), chatFn: null,
});

describe('world knowledge in the system prompt', () => {
  test('every stage teaches the glossary and the goal', () => {
    for (const stage of ['start', 'guardians', 'forge', 'unstable', 'stable', 'full']) {
      const prompt = guide.buildSystemPrompt(stage);
      for (const term of ['Nine broke', 'quantum computer', 'Resonance hub', 'Chambers',
        'Quantum Forge', 'Continuum', 'Operator Code', 'no single "win"', 'any order']) {
        assert.ok(prompt.includes(term), `${stage}: ${term}`);
      }
    }
  });
});

describe('offline answers to basic questions', () => {
  test('every listed question gets a real start-stage answer', async () => {
    assert.equal(START().stage, 'start');
    for (const q of QUESTIONS) {
      const out = await askOffline(START(), q);
      assert.equal(out.source, 'offline', q);
      assert.ok(out.reply.includes(EXPECTED[q][0]), `${q} -> ${out.reply}`);
      assert.ok(out.reply.includes('...'), `${q} keeps the broken voice`);
    }
  });

  test('every listed question gets a clear later-stage answer', async () => {
    assert.equal(STABLE().stage, 'stable');
    for (const q of QUESTIONS) {
      const out = await askOffline(STABLE(), q);
      assert.equal(out.source, 'offline', q);
      assert.ok(out.reply.includes(EXPECTED[q][1]), `${q} -> ${out.reply}`);
      assert.ok(!out.reply.includes('...'), `${q} uses the clear voice`);
    }
  });

  test('unmatched questions fall back to the stage default', async () => {
    const startOut = await askOffline(START(), 'what do you mean');
    assert.equal(startOut.reply, guide.START_OFFLINE_LINE);
    const stableOut = await askOffline(STABLE(), 'what do you mean');
    assert.equal(stableOut.reply, STABLE().nextStep);
  });

  test('"what do I do first?" never prescribes a Guardian', async () => {
    const startOut = await askOffline(START(), 'what do I do first?');
    assert.ok(startOut.reply.includes('any order'), 'any order at start');
    const stableOut = await askOffline(STABLE(), 'what do I do first?');
    assert.equal(stableOut.reply, STABLE().nextStep, 'later stages answer with the live next step');
    for (const out of [startOut, stableOut]) {
      for (const name of ['Refrax', 'Magnetica', 'Chrona', 'Violet Flicker']) {
        assert.ok(!out.reply.includes(name), `names no Guardian: ${name}`);
      }
      assert.equal(guide.violatesGuideRules(out.reply), null, 'passes the guards');
    }
  });
});

describe('fake-Meta replies at both stages', () => {
  const askMeta = (merged, question, reply) => guide.answerGuide({
    architectId: 'arch-19d', merged, question,
    limiter: guide.createRateLimiter({}), chatFn: async () => reply,
  });

  test('content-carrying replies pass at the start stage', async () => {
    const out = await askMeta(START(), 'what are qbits?',
      'Qbits are my building blocks. Parts, fixes and boost give them power.');
    assert.equal(out.source, 'meta');
  });

  test('babble falls back to the matched question answer', async () => {
    const out = await askMeta(START(), 'what are qbits?', 'unclear... signal fractured...');
    assert.equal(out.source, 'offline');
    assert.ok(out.reply.includes('Qbits'), `falls back to the qbit answer: ${out.reply}`);
  });

  test('content-carrying replies pass at a later stage', async () => {
    const out = await askMeta(STABLE(), 'what is the continuum?',
      'The Continuum is my awakened world of engineering challenges.');
    assert.equal(out.source, 'meta');
  });
});

describe('glossary content check', () => {
  test('the bare Machine name still fails; glossary words pass', () => {
    assert.equal(guide.hasStartContent('I... am The Machine...'), false);
    for (const reply of [
      'The Forge... invents Qbits.',
      'Restore... any chamber.',
      'Your code... saves you.',
      'Enter the Continuum... soon.',
      'I grow... as you invent.',
    ]) {
      assert.equal(guide.hasStartContent(reply), true, reply);
    }
  });

  test('rate limit stays 20 per hour; limited calls return nextStep only', async () => {
    assert.equal(guide.GUIDE_RATE_LIMIT, 20);
    const limiter = guide.createRateLimiter({});
    const merged = START();
    let last;
    for (let i = 0; i < 21; i++) {
      last = await guide.answerGuide({
        architectId: 'arch-19d-lim', merged, question: 'what are qbits?',
        limiter, chatFn: async () => 'Qbits are my building blocks.',
      });
    }
    assert.equal(last.source, 'offline');
    assert.equal(last.reply, merged.nextStep, 'limited calls return nextStep only');
  });
});
