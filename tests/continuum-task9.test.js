'use strict';
// Hackathon step 9: chamber typed follow-ups answered by Meta with context.
// (node:test + node:assert only). All model clients are fakes; no network.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  FOLLOWUP_MAX_TOKENS,
  FOLLOWUP_FALLBACK,
  buildFollowupMessages,
  buildFollowupRetryMessages,
  mentionsModSymbol,
  followupProbe,
} = require('../server/chamber-followup');

const NOTICE_FALLBACK = 'What did you notice when you tried that?';

// Realistic context: player dropped C// into the Laser (needs F::) and asked why.
const CTX = {
  chamber: 'refrax',
  qbitName: 'Refrax',
  partName: 'Laser',
  attemptedMod: 'C//',
  correctMod: 'F::',
  transcript: 'why did the laser fail',
  machineJob: 'I open all the possibilities at once.',
};

function fakeClient(script, calls) {
  let i = 0;
  return {
    chat: {
      completions: {
        create: async (params) => {
          if (calls) calls.push(params);
          const step = script[Math.min(i, script.length - 1)];
          i += 1;
          if (step && typeof step === 'object' && step.error) throw new Error(step.error);
          return { choices: [{ message: { content: step } }] };
        },
      },
    },
  };
}

describe('follow-up prompt (typed question, not the rigid 3-line format)', () => {
  test('answers the player question with full context in the Guardian voice', () => {
    const messages = buildFollowupMessages(CTX);
    assert.equal(messages.length, 2);
    assert.equal(messages[1].role, 'user');
    assert.equal(messages[1].content, 'why did the laser fail');
    const system = messages[0].content;
    assert.ok(system.includes('Laser'), 'names the current part');
    assert.ok(system.includes('C//'), 'names what the player tried');
    assert.ok(system.includes('Guardian'), 'Guardian voice');
    assert.ok(system.includes('max 2 sentences'), 'max 2 sentences');
    assert.ok(system.includes('Socratic'), 'Socratic');
    assert.ok(system.includes('Never name the correct mod symbol'), 'never-name rule');
    assert.ok(system.includes('nudge back'), 'off-topic nudge rule');
    assert.ok(!system.includes('Reply in exactly 3 lines'), 'not the rigid first-probe format');
  });

  test('retry prompt is shorter but keeps the part, the question, and the never-name rule', () => {
    const first = buildFollowupMessages(CTX)[0].content;
    const retry = buildFollowupRetryMessages(CTX)[0].content;
    assert.ok(retry.length < first.length, 'retry system prompt is shorter');
    assert.ok(retry.includes('Laser'), 'retry keeps the part');
    assert.ok(retry.includes('never name'), 'retry keeps the never-name rule');
    assert.equal(buildFollowupRetryMessages(CTX)[1].content, 'why did the laser fail');
  });

  test('completion budget leaves headroom for a reasoning model', () => {
    assert.equal(FOLLOWUP_MAX_TOKENS, 1000);
    assert.equal(FOLLOWUP_FALLBACK, NOTICE_FALLBACK);
  });
});

describe('followupProbe() with fake client', () => {
  test('success returns the trimmed reply and passes the token budget', async () => {
    const calls = [];
    const probe = await followupProbe(CTX, {
      client: fakeClient(['  The Laser scattered the beam. What would hold every path open?  '], calls),
    });
    assert.equal(probe, 'The Laser scattered the beam. What would hold every path open?');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].max_completion_tokens, 1000);
    assert.equal(calls[0].messages[1].content, 'why did the laser fail');
  });

  test('strips asterisk markup like the first-probe path', async () => {
    const probe = await followupProbe(CTX, { client: fakeClient(['**Bold** hint?']) });
    assert.equal(probe, 'Bold hint?');
  });

  test('empty then text: one retry with the shorter prompt, returns the text', async () => {
    const calls = [];
    const probe = await followupProbe(CTX, {
      client: fakeClient(['   ', 'The beam scattered. What holds paths open?'], calls),
    });
    assert.equal(probe, 'The beam scattered. What holds paths open?');
    assert.equal(calls.length, 2);
    assert.ok(calls[1].messages[0].content.length < calls[0].messages[0].content.length);
  });

  test('empty twice: exactly one retry, then the player-safe fallback', async () => {
    const calls = [];
    const probe = await followupProbe(CTX, { client: fakeClient(['  ', ''], calls) });
    assert.equal(probe, NOTICE_FALLBACK);
    assert.equal(calls.length, 2);
  });

  test('transport errors propagate (no retry), so the route can use its generic fallback', async () => {
    const calls = [];
    await assert.rejects(
      followupProbe(CTX, { client: fakeClient([{ error: 'boom' }], calls) }),
      /boom/
    );
    assert.equal(calls.length, 1);
  });
});

describe('the answer never contains the correct mod symbol', () => {
  test('mentionsModSymbol finds standalone symbols, not substrings', () => {
    assert.equal(mentionsModSymbol('Try F:: here.', 'F::'), true);
    assert.equal(mentionsModSymbol('Use (C//) to lock it.', 'C//'), true);
    assert.equal(mentionsModSymbol('SH held it open.', 'SH'), true);
    assert.equal(mentionsModSymbol('try sh instead', 'SH'), true);
    assert.equal(mentionsModSymbol('You should hold the paths open.', 'SH'), false);
    assert.equal(mentionsModSymbol('The show must go on.', 'SH'), false);
    assert.equal(mentionsModSymbol('What does the Laser need?', 'F::'), false);
    assert.equal(mentionsModSymbol('', 'F::'), false);
    assert.equal(mentionsModSymbol('Use F:: now.', ''), false);
  });

  test('leaky reply then clean: rejects the leak, retries, returns clean text', async () => {
    const calls = [];
    const probe = await followupProbe(CTX, {
      client: fakeClient(['Just use F:: on it.', 'The beam scattered. What would line it up?'], calls),
    });
    assert.equal(probe, 'The beam scattered. What would line it up?');
    assert.equal(calls.length, 2);
    assert.equal(mentionsModSymbol(probe, CTX.correctMod), false);
  });

  test('leaky twice: one retry, then the fallback (never the leaked answer)', async () => {
    const calls = [];
    const probe = await followupProbe(CTX, {
      client: fakeClient(['Use F:: now.', 'F:: is the answer.'], calls),
    });
    assert.equal(probe, NOTICE_FALLBACK);
    assert.equal(calls.length, 2);
  });
});

describe('server wiring: voice_transcript takes the follow-up branch', () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  function routeSpan(routePath) {
    const start = serverSrc.indexOf(`app.post('${routePath}'`);
    assert.ok(start !== -1, `route ${routePath} is registered`);
    const next = serverSrc.indexOf('app.post(', start + 1);
    return serverSrc.slice(start, next === -1 ? undefined : next);
  }

  test('chamber-probe routes typed transcripts to followupProbe with context', () => {
    assert.ok(serverSrc.includes("require('./server/chamber-followup')"), 'loads the follow-up helper');
    const span = routeSpan('/api/chamber-probe');
    assert.ok(span.includes('followupProbe('), 'calls followupProbe');
    assert.ok(span.includes('voice_transcript'), 'branches on the typed transcript');
    assert.ok(span.includes('transcript: _transcript'), 'passes the player question');
    assert.ok(span.includes('partName: _partName'), 'passes the current part');
    assert.ok(span.includes('correctMod: _correctMod'), 'passes the hidden fix');
  });

  test('first-probe path is unchanged (rigid format, budget, fallbacks, logging)', () => {
    const span = routeSpan('/api/chamber-probe');
    assert.ok(span.includes('Reply in exactly 3 lines'), 'first-probe prompt kept');
    assert.ok(span.includes('What did you observe when you tried that?'), 'first-probe empty fallback kept');
    assert.ok(span.includes('[ChamberProbe]'), 'logging kept');
  });
});

describe('client: typed sends carry the first-probe context (all four chambers)', () => {
  const CHAMBERS = ['refrax', 'magnetica', 'chrona', 'violetflicker'];
  const CONTEXT_FIELDS = [
    'dropped_into_slot',
    'correct_mod_for_slot',
    'target_part_id',
    'target_part_name',
    'attempted_mod',
    'correct_mod',
  ];

  for (const chamber of CHAMBERS) {
    test(`${chamber}: _doSend includes the failed-drop context`, () => {
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'chambers', `${chamber}.js`), 'utf8');
      const at = src.indexOf('function _doSend()');
      assert.ok(at !== -1, `${chamber} has _doSend`);
      const span = src.slice(at, at + 2500);
      assert.ok(span.includes('voice_transcript: val'), `${chamber} still sends the typed question`);
      for (const field of CONTEXT_FIELDS) {
        assert.ok(span.includes(`${field}:`), `${chamber} _doSend sends ${field}`);
      }
      assert.ok(span.includes('_currentAttemptedMod'), `${chamber} sends the remembered mod`);
      assert.ok(span.includes('_currentTargetPartName'), `${chamber} sends the remembered part`);
      assert.ok(span.includes('_currentCorrectMod'), `${chamber} sends the remembered fix`);
    });

    test(`${chamber}: _chamberProbe remembers the context; no other probe calls added`, () => {
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'chambers', `${chamber}.js`), 'utf8');
      assert.ok(
        src.includes('_currentAttemptedMod = modTried'),
        `${chamber} remembers the tried mod`);
      assert.ok(
        src.includes('_currentTargetPartName = droppedIntoSlot'),
        `${chamber} remembers the part`);
      assert.ok(
        src.includes('_currentCorrectMod = correctModForSlot'),
        `${chamber} remembers the fix`);
      const posts = src.split("fetch('/api/chamber-probe'").length - 1;
      assert.equal(posts, 2, `${chamber} still has exactly first-probe + typed-send posts`);
    });
  }
});
