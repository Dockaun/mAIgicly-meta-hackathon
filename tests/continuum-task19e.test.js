'use strict';
// Hackathon step 19e: the Machine stays in character with lore-true facts.
// guardian-lore.csv holds nine Qbits (four Guardians + five Forge pieces);
// the glossary and offline answers repeat its facts; the Machine never says
// out-of-world words (game, mAIgicly, fictional, player, app, "invented
// for"); the Forge code list covers every CSV symbol (CL±/FL⚡ are absent, so
// correctly unrecognized) with canonical lore lines.
// (node:test + node:assert only). No network, no PGlite.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const guide = require('../server/guide');
const machine = require('../server/machine-context');

const CSV = fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'guardian-lore.csv'), 'utf8');
const CSV_SYMBOLS = ['SH', 'F::', 'C//', 'PH~', 'N0', 'EN≡', 'G0'];
const REAL_SENTENCE = 'Qbits are inspired by real quantum bits, called qubits, but they are not the same thing.';

const START = () => guide.mergeProgress({ server: {}, client: {} });
const STABLE = () => guide.mergeProgress({
  server: { restored: ['refrax', 'magnetica'], forgeAvailable: true, qbits: 3 },
  client: {},
});
const askOffline = (merged, question) => guide.answerGuide({
  architectId: 'arch-19e', merged, question,
  limiter: guide.createRateLimiter({}), chatFn: null,
});
const askMeta = (merged, question, reply) => guide.answerGuide({
  architectId: 'arch-19e', merged, question,
  limiter: guide.createRateLimiter({}), chatFn: async () => reply,
});

describe('guardian-lore.csv is the source of truth', () => {
  test('all nine Qbits present: four Guardians plus five Forge pieces', () => {
    const rows = CSV.trim().split('\n').slice(1);
    assert.equal(rows.length, 9);
    for (const name of ['Violet Flicker', 'Refrax', 'Magnetica', 'Chrona',
      'Harmonic Tuning', 'Entanglement', 'Coherence Stitching',
      'Energy Absorption', 'Stealth Masking']) {
      assert.ok(CSV.includes(name), `csv: ${name}`);
    }
  });

  test('every CSV symbol is in the Forge code list; CL±/FL⚡ absent everywhere', () => {
    for (const sym of CSV_SYMBOLS) assert.ok(CSV.includes(sym), `csv: ${sym}`);
    assert.ok(!CSV.includes('CL±') && !CSV.includes('FL⚡'), 'no CL±/FL⚡ in the csv');
    const codes = machine.CODE_VOCAB.map((e) => e.code);
    for (const sym of CSV_SYMBOLS) assert.ok(codes.includes(sym), `vocab: ${sym}`);
    assert.ok(!codes.join(' ').includes('CL±'), 'no CL± in the vocab');
  });

  test('"what is CL±?" is correctly unrecognized', () => {
    assert.deepEqual(machine.findCodesInQuestion('what is CL±?'), []);
    const user = machine.buildMachineUserMessage({
      missionId: 'entanglement', parts: [], fixes: [], boost: null,
      testResult: '', question: 'what is CL±?',
    });
    assert.ok(!user.includes('CODE VOCABULARY'), 'no vocab block for an unknown code');
  });

  test('code entries carry canonical lore lines', () => {
    for (const entry of machine.CODE_VOCAB) {
      assert.ok(entry.lore && entry.lore.length > 10, `${entry.code} has a lore line`);
    }
    const user = machine.buildMachineUserMessage({
      missionId: 'entanglement', parts: [], fixes: [], boost: null,
      testResult: '', question: 'what is sh?',
    });
    assert.ok(user.includes('Keeps multiple signal possibilities open'), 'lore in context');
  });
});

describe('lore-true glossary and answers', () => {
  test('glossary states the CSV facts with no out-of-world words', () => {
    for (const fact of ['Nine broke', 'pieces of the quantum computer',
      'elements, parts, fixes and boost', 'shared network', 'called qubits']) {
      assert.ok(guide.WORLD_GLOSSARY.includes(fact), `glossary: ${fact}`);
    }
    for (const word of ['mAIgicly', 'fictional', 'invented for', 'player', 'game', 'app']) {
      assert.ok(!guide.WORLD_GLOSSARY.toLowerCase().includes(word), `glossary avoids ${word}`);
    }
    assert.ok(guide.buildSystemPrompt('start').includes('instead of \'player\''),
      'prompt teaches the in-character rule');
  });

  test('"what are qbits?" states the lore at both stages', async () => {
    const startOut = await askOffline(START(), 'what are qbits?');
    assert.ok(startOut.reply.includes('pieces of me'), startOut.reply);
    const stableOut = await askOffline(STABLE(), 'what are qbits?');
    assert.ok(stableOut.reply.includes('Nine broke'), stableOut.reply);
  });

  test('"are qbits real?" gets the canonical sentence', async () => {
    for (const merged of [START(), STABLE()]) {
      const out = await askOffline(merged, 'are qbits real?');
      assert.equal(out.reply, REAL_SENTENCE);
    }
    const meta = await askMeta(START(), 'are qbits real?', REAL_SENTENCE);
    assert.equal(meta.source, 'meta', 'canonical sentence passes the checks');
  });

  test('"is this a game?" stays in character', async () => {
    for (const merged of [START(), STABLE()]) {
      const out = await askOffline(merged, 'is this a game?');
      assert.ok(out.reply.toLowerCase().includes('real'), out.reply);
      assert.equal(guide.violatesInCharacter(out.reply), null, 'says no banned word');
    }
  });

  test('"how many qbits are there?" counts nine', async () => {
    for (const merged of [START(), STABLE()]) {
      const out = await askOffline(merged, 'how many qbits are there?');
      assert.ok(out.reply.includes('Nine'), out.reply);
    }
  });
});

describe('out-of-world post-check', () => {
  test('each banned word rejects', () => {
    for (const reply of [
      'Welcome to the game.',
      'I was made for mAIgicly.',
      'This is fictional lore.',
      'Hey player, choose one.',
      'Open the app now.',
      'Qbits were invented for this world.',
    ]) {
      assert.equal(guide.violatesInCharacter(reply), 'in-character', reply);
    }
  });

  test('in-world wording passes, including bare "invent"', () => {
    for (const reply of [
      'Then invent solutions.',
      REAL_SENTENCE,
      'Restore any Guardian.',
    ]) {
      assert.equal(guide.violatesInCharacter(reply), null, reply);
    }
  });

  test('breaking character falls back in-voice at every stage', async () => {
    for (const merged of [START(), STABLE()]) {
      const out = await askMeta(merged, 'what are you?', 'This game is fun to play.');
      assert.equal(out.source, 'offline', merged.stage);
      assert.equal(guide.violatesInCharacter(out.reply), null, 'fallback stays in character');
    }
  });
});
