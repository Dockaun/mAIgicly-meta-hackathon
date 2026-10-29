'use strict';
// Hackathon step 6: chamber + Forge Socratic guidance on Meta (meta-chat),
// player-safe fallback text, nudge track layout fix.
// (node:test + node:assert only). All model clients are fakes; no network.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  chat,
  META_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  REASONING_EFFORT,
  createMetaClient,
} = require('../server/meta-chat');

const SAFE_FALLBACK = 'What did you notice when you tried that?';

function fakeClientFor(content, calls) {
  return {
    chat: {
      completions: {
        create: async (params) => {
          if (calls) calls.push(params);
          return { choices: [{ message: { content } }] };
        },
      },
    },
  };
}

describe('meta-chat client setup', () => {
  test('uses the Meta Model API base URL, spark model, minimal reasoning, 25s timeout', () => {
    assert.equal(META_BASE_URL, 'https://api.meta.ai/v1');
    assert.equal(DEFAULT_MODEL, 'muse-spark-1.3');
    assert.equal(REASONING_EFFORT, 'minimal');
    // Raised 15s -> 25s in hackathon step 11: first attempts kept timing out.
    assert.equal(DEFAULT_TIMEOUT_MS, 25000);
  });

  test('default client is maxRetries 0 (one SDK call equals one Meta call)', () => {
    const prev = process.env.MODEL_API_KEY;
    process.env.MODEL_API_KEY = 'dummy-key-for-constructor';
    try {
      const client = createMetaClient();
      assert.equal(client.maxRetries, 0);
    } finally {
      if (prev === undefined) delete process.env.MODEL_API_KEY;
      else process.env.MODEL_API_KEY = prev;
    }
  });
});

describe('meta-chat chat() with fake client', () => {
  test('success returns the trimmed model reply', async () => {
    const text = await chat(
      [
        { role: 'system', content: 'Ask one short question.' },
        { role: 'user', content: 'I tried SH and it did not work.' },
      ],
      { maxTokens: 500, client: fakeClientFor('  Why did that fix fit here?  ') }
    );
    assert.equal(text, 'Why did that fix fit here?');
  });

  test('passes model, reasoning_effort, messages and max tokens through', async () => {
    const calls = [];
    const messages = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ];
    await chat(messages, { maxTokens: 500, client: fakeClientFor('ok', calls) });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].model, 'muse-spark-1.3');
    assert.equal(calls[0].reasoning_effort, 'minimal');
    assert.equal(calls[0].max_completion_tokens, 500);
    assert.deepEqual(calls[0].messages, messages);
  });

  test('CONTINUUM_MODEL overrides the default model', async () => {
    const prev = process.env.CONTINUUM_MODEL;
    process.env.CONTINUUM_MODEL = 'muse-spark-override';
    try {
      const calls = [];
      await chat([{ role: 'user', content: 'hi' }], { maxTokens: 500, client: fakeClientFor('ok', calls) });
      assert.equal(calls[0].model, 'muse-spark-override');
    } finally {
      if (prev === undefined) delete process.env.CONTINUUM_MODEL;
      else process.env.CONTINUUM_MODEL = prev;
    }
  });

  test('timeout rejects with meta_client_timeout so the route falls back', async () => {
    const hanging = { chat: { completions: { create: () => new Promise(() => {}) } } };
    await assert.rejects(
      chat([{ role: 'user', content: 'hi' }], { maxTokens: 500, client: hanging, timeoutMs: 30 }),
      /meta_client_timeout/
    );
  });

  test('empty model reply rejects with empty_model_response so the route falls back', async () => {
    await assert.rejects(
      chat([{ role: 'user', content: 'hi' }], { maxTokens: 500, client: fakeClientFor('   ') }),
      /empty_model_response/
    );
    await assert.rejects(
      chat([{ role: 'user', content: 'hi' }], {
        maxTokens: 500,
        client: { chat: { completions: { create: async () => ({ choices: [] }) } } },
      }),
      /empty_model_response/
    );
  });

  test('never exposes MODEL_API_KEY in result or logs', async () => {
    process.env.MODEL_API_KEY = '[REDACTED]';
    const lines = [];
    const origLog = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    try {
      const text = await chat(
        [{ role: 'user', content: 'hi' }],
        { maxTokens: 500, client: fakeClientFor('Why did that fit?') }
      );
      assert.ok(!text.includes('[REDACTED]'));
      await assert.rejects(
        chat([{ role: 'user', content: 'hi' }], { maxTokens: 500, client: fakeClientFor('  ') }),
        /empty_model_response/
      );
      assert.ok(!lines.join('\n').includes('[REDACTED]'));
    } finally {
      console.log = origLog;
      delete process.env.MODEL_API_KEY;
    }
  });
});

describe('each of the 4 routes uses meta-chat', () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  function routeSpan(routePath) {
    const start = serverSrc.indexOf(`app.post('${routePath}'`);
    assert.ok(start !== -1, `route ${routePath} is registered`);
    const next = serverSrc.indexOf('app.post(', start + 1);
    return serverSrc.slice(start, next === -1 ? undefined : next);
  }

  test('server.js loads the meta-chat helper', () => {
    assert.ok(serverSrc.includes("require('./server/meta-chat')"));
  });

  const ROUTES = [
    '/api/forge-probe',
    '/api/chamber-probe',
    '/api/forge-companion/probe',
    '/api/machine-hint',
  ];
  // Legacy endpoint/key fragments, assembled so this file stays clean.
  const LEGACY_HOST = 'api.deep' + 'seek.com';
  const LEGACY_KEY = 'DEEP' + 'SEEK_API_KEY';
  for (const route of ROUTES) {
    test(`${route} calls chat() and checks MODEL_API_KEY, no legacy engine`, () => {
      const span = routeSpan(route);
      assert.ok(span.includes('chat('), `${route} calls meta-chat chat()`);
      assert.ok(span.includes('MODEL_API_KEY'), `${route} checks MODEL_API_KEY`);
      assert.ok(!span.includes(LEGACY_HOST), `${route} has no legacy fetch`);
      assert.ok(!span.includes(LEGACY_KEY), `${route} has no legacy key check`);
      assert.ok(!span.includes('[development fallback]'), `${route} shows no dev prefix`);
    });
  }

  test('dev-fallback probes use the player-safe text with source kept in JSON', () => {
    for (const route of ['/api/forge-probe', '/api/chamber-probe', '/api/forge-companion/probe']) {
      const span = routeSpan(route);
      assert.ok(span.includes(SAFE_FALLBACK), `${route} fallback text`);
      assert.ok(span.includes("source: 'dev-fallback'"), `${route} keeps source in JSON`);
    }
    assert.ok(!serverSrc.includes('[development fallback]'), 'no player-visible dev prefix remains');
  });

  test('machine-hint fallback is the player-safe text', () => {
    const span = routeSpan('/api/machine-hint');
    assert.ok(span.includes(`'${SAFE_FALLBACK}'`), 'machine-hint FALLBACK text');
  });

  test('each route keeps its prompt, catch fallback and logging', () => {
    const forge = routeSpan('/api/forge-probe');
    assert.ok(forge.includes('Ask one precise probing question'), 'forge prompt kept');
    assert.ok(forge.includes('What happened when you used that fix in the chamber?'), 'forge catch fallback kept');
    assert.ok(forge.includes('[ForgeProbe]'), 'forge logging kept');

    const chamber = routeSpan('/api/chamber-probe');
    assert.ok(chamber.includes('Reply in exactly 3 lines'), 'chamber prompt kept');
    assert.ok(chamber.includes('What did you observe when you tried that?'), 'chamber empty fallback kept');
    assert.ok(chamber.includes('[ChamberProbe]'), 'chamber logging kept');

    const companion = routeSpan('/api/forge-companion/probe');
    assert.ok(companion.includes('Ask one precise Socratic question'), 'companion prompt kept');
    assert.ok(companion.includes('What happened when you used that component in the chamber?'), 'companion catch fallback kept');
    assert.ok(companion.includes('[ForgeCompanion]'), 'companion logging kept');

    const machine = routeSpan('/api/machine-hint');
    assert.ok(machine.includes('conversation_history'), 'machine history kept');
    assert.ok(machine.includes('[MachineHint]'), 'machine logging kept');
  });

  test('My Forge / training / LoRA legacy-engine code removed (step 14)', () => {
    assert.ok(!serverSrc.includes('api.deep' + 'seek.com'), 'no legacy calls remain');
    assert.ok(!serverSrc.includes('DEEP' + 'SEEK_API_KEY'), 'no legacy key checks remain');
  });
});

describe('nudge track layout (all four chambers)', () => {
  const CHAMBERS = ['refrax', 'magnetica', 'chrona', 'violetflicker'];
  for (const chamber of CHAMBERS) {
    test(`${chamber}: track sits on its own full-width line under label and buttons`, () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'chambers', `${chamber}.js`), 'utf8');
      const nudgeAt = src.indexOf('row.mini === "nudge_to_zone"');
      assert.ok(nudgeAt !== -1, `${chamber} has the nudge mini-game`);
      const span = src.slice(nudgeAt, nudgeAt + 3000);
      const leftAt = span.indexOf('id="left"');
      const rightAt = span.indexOf('id="right"');
      const trackAt = span.indexOf('id="track"');
      assert.ok(leftAt !== -1 && rightAt !== -1 && trackAt !== -1, `${chamber} keeps all nudge ids`);
      assert.ok(leftAt < rightAt && rightAt < trackAt, `${chamber} buttons row comes before the track line`);
      assert.ok(span.includes('id="nudgeRow"') && span.includes('id="marker"') && span.includes('id="status"'));
    });

    test(`${chamber}: arrow handlers still move the marker (no logic change)`, () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'chambers', `${chamber}.js`), 'utf8');
      assert.ok(src.includes('marker.style.left = `${pos}%`'), `${chamber} paint moves the marker`);
      assert.ok(src.includes('pos - step') && src.includes('pos + step'), `${chamber} arrows step both ways`);
      assert.ok(src.includes('ArrowLeft') && src.includes('ArrowRight'), `${chamber} keyboard arrows kept`);
    });

    test(`${chamber}: track CSS guarantees a visible >=160px track`, () => {
      const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'chambers', `${chamber}.html`), 'utf8');
      assert.match(html, /min-width:\s*160px/, `${chamber} track min-width 160px`);
    });
  }
});
