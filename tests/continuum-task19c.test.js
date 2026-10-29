'use strict';
// Hackathon step 19c: at the start stage the Machine keeps its broken style
// (ellipses, static, short phrases) but every reply must still carry real
// content: it is the quantum computer at the heart of this world; it broke
// and its powers scattered into four Guardians; restoring any Guardian, in
// any order, returns part of it; the player should choose one. The
// deterministic post-check rejects content-free replies and falls back to an
// offline line in the same voice. Later stages are unchanged.
// (node:test + node:assert only). No network, no PGlite.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const guide = require('../server/guide');

const START_MERGED = () => guide.mergeProgress({ server: {}, client: {} });
const answerStart = (question, reply) => guide.answerGuide({
  architectId: 'arch-19c',
  merged: START_MERGED(),
  question,
  limiter: guide.createRateLimiter({}),
  chatFn: async () => reply,
});

describe('start-stage content post-check', () => {
  test('content-free babble is rejected; factual broken speech passes', () => {
    assert.equal(guide.hasStartContent('I... am The Machine...'), false);
    assert.equal(guide.hasStartContent('unclear... signal fractured...'), false);
    assert.equal(guide.hasStartContent('My systems... failing. Choose one.'), true);
    assert.equal(
      guide.hasStartContent('My powers... scattered into four Guardians. Restore any one.'),
      true,
    );
  });

  test('the reported questions fall back to the in-voice offline line on babble', async () => {
    for (const [question, marker] of [
      ['what are you?', 'quantum computer'],
      ['what do you mean', 'heart of this world'],
      ['help', 'I guide'],
    ]) {
      const out = await answerStart(question, 'unclear... signal fractured...');
      assert.equal(out.source, 'offline', question);
      assert.ok(out.reply.includes(marker), `${question} -> ${out.reply}`);
      assert.ok(out.reply.includes('...'), `${question} keeps the broken voice`);
      assert.equal(out.nextStep, START_MERGED().nextStep, 'nextStep line unchanged');
    }
  });

  test('the reported questions pass through content-carrying replies', async () => {
    for (const question of ['what are you?', 'what do you mean', 'help']) {
      const out = await answerStart(
        question,
        'I am... the machine at the heart of this world. Choose one.',
      );
      assert.equal(out.source, 'meta', question);
    }
  });

  test('ellipses do not end sentences when truncating', () => {
    assert.equal(
      guide.truncateSentences('My systems... failing. Choose one.', 2),
      'My systems... failing. Choose one.',
    );
    assert.equal(guide.truncateSentences('One... two. Three. Four.', 2), 'One... two. Three.');
  });

  test('offline line carries the facts in the broken voice', () => {
    for (const word of ['heart', 'world', 'powers', 'scattered', 'Guardians']) {
      assert.ok(guide.START_OFFLINE_LINE.includes(word), `offline line: ${word}`);
    }
    assert.ok(guide.START_OFFLINE_LINE.includes('...'), 'broken style kept');
  });

  test('start voice teaches the four facts and stays fragmented', () => {
    const prompt = guide.buildSystemPrompt('start');
    assert.ok(/fragmented|uncertain/i.test(prompt), 'broken style kept');
    for (const fact of ['quantum computer', 'heart of this world', 'scattered',
      'four guardians', 'any order', 'choose']) {
      assert.ok(prompt.toLowerCase().includes(fact), `start voice: ${fact}`);
    }
  });
});

describe('later stages keep their current voice', () => {
  test('no content check outside the start stage', async () => {
    const merged = guide.mergeProgress({ server: { qbits: 2 }, client: {} });
    assert.equal(merged.stage, 'unstable');
    const out = await guide.answerGuide({
      architectId: 'arch-19c',
      merged,
      question: 'what do you mean',
      limiter: guide.createRateLimiter({}),
      chatFn: async () => 'unclear... signal fractured...',
    });
    assert.equal(out.source, 'meta', 'babble still passes outside start');
  });

  test('unstable offline fallback is still the nextStep line', async () => {
    const merged = guide.mergeProgress({ server: { qbits: 2 }, client: {} });
    const out = await guide.answerGuide({
      architectId: 'arch-19c', merged, limiter: guide.createRateLimiter({}), chatFn: null,
    });
    assert.equal(out.reply, merged.nextStep);
  });
});
