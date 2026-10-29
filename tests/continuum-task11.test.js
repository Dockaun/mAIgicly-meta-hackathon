'use strict';
// Hackathon step 11: save-your-code gate, visible header code, restore
// verified (incl. continuum data), Meta timeouts.
// (node:test + node:assert only). No network, no PGlite: the progress store
// is tested against a fake sql tag; the live restore check on port 5055
// exercises it against real PGlite.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { saveProgress, getProgress, PROGRESS_KEYS } = require('../server/player-progress');

// --- operator-id.js under stubbed browser globals (Node has no DOM) ---
const opStore = { maigicly_architect_id: 'test-architect-stub' };
global.localStorage = {
  getItem: (k) => (k in opStore ? opStore[k] : null),
  setItem: (k, v) => { opStore[k] = String(v); },
  removeItem: (k) => { delete opStore[k]; },
};
global.document = {
  readyState: 'complete',
  addEventListener: () => {},
  createElement: () => ({ style: {}, addEventListener: () => {} }),
  body: { appendChild: () => {} },
  getElementById: () => null,
};
global.window = global;
require('../public/js/operator-id.js');
const OperatorID = window.OperatorID;

describe('confirm-step check is case- and space-insensitive', () => {
  test('normalizeCode uppercases, trims, and collapses spaces', () => {
    assert.equal(OperatorID.normalizeCode('STRAND 1534'), 'STRAND 1534');
    assert.equal(OperatorID.normalizeCode('  strand   1534  '), 'STRAND 1534');
    assert.equal(OperatorID.normalizeCode('Strand\t1534'), 'STRAND 1534');
    assert.equal(OperatorID.normalizeCode(''), '');
    assert.equal(OperatorID.normalizeCode(null), '');
  });

  test('codesMatch accepts case/space variants, rejects wrong and empty', () => {
    assert.equal(OperatorID.codesMatch('strand 1534', 'STRAND 1534'), true);
    assert.equal(OperatorID.codesMatch('  STRAND   1534 ', 'strand 1534'), true);
    assert.equal(OperatorID.codesMatch('STRAND 1535', 'STRAND 1534'), false);
    assert.equal(OperatorID.codesMatch('', 'STRAND 1534'), false);
    assert.equal(OperatorID.codesMatch('STRAND 1534', ''), false);
  });

  test('confirmed/restored flags round-trip in localStorage', () => {
    assert.equal(OperatorID.isConfirmed(), false);
    assert.equal(OperatorID.isRestored(), false);
    OperatorID.markConfirmed();
    OperatorID.markRestored();
    assert.equal(OperatorID.isConfirmed(), true);
    assert.equal(OperatorID.isRestored(), true);
    delete opStore.operator_id_confirmed;
    delete opStore.operator_id_restored;
  });
});

describe('save-your-code gate markup and flow (operator-id.js)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'operator-id.js'), 'utf8');

  test('two-step gate with the exact player-facing copy', () => {
    assert.ok(src.includes('showSaveGate'), 'exports showSaveGate');
    assert.ok(src.includes('This is your Operator Code. Write it down now.'), 'gate explanation');
    assert.ok(src.includes('No email or password.'), 'no-credentials line');
    assert.ok(src.includes('COPY CODE'), 'copy button');
    assert.ok(src.includes('I WROTE IT DOWN'), 'wrote-it-down button');
    assert.ok(src.includes('Type your Operator Code to continue.'), 'typing prompt');
    assert.ok(src.includes('Not quite. Check what you wrote.'), 'wrong-code message');
    assert.ok(src.includes('SHOW MY CODE AGAIN'), 'show-again link');
  });

  test('gate skips confirmed/restored players and uses the tolerant matcher', () => {
    assert.ok(src.includes('isConfirmed() || isRestored()'), 'skips both kinds of known players');
    assert.ok(src.includes('codesMatch(input.value, id)'), 'typed check uses codesMatch');
    assert.ok(src.includes('opSaveView1') && src.includes('opSaveView2'), 'two views');
    assert.ok(!src.includes('showRevealModal'), 'dead prefill modal is gone');
  });

  test('no personal data is collected: code only, no such inputs', () => {
    assert.ok(!src.includes('type="email"'), 'no email input');
    assert.ok(!src.toLowerCase().includes('your age'), 'no age prompt');
    assert.ok(!src.toLowerCase().includes('your name'), 'no name prompt');
    assert.ok(!src.includes('type="password"'), 'no password input');
  });
});

describe('progress store round-trips unlocks (fake sql tag)', () => {
  // In-memory stand-in for the Neon/PGlite `sql` tag: records statements,
  // upserts into a Map, answers the SELECT. The live restore check on port
  // 5055 exercises the same functions against real PGlite.
  function fakeSql() {
    const store = new Map();
    const calls = [];
    function tag(strings, ...values) {
      const text = strings.join('?');
      calls.push({ text, values });
      if (/INSERT INTO player_progress/.test(text)) {
        store.set(`${values[0]}\u0000${values[1]}`, String(values[2]));
        return Promise.resolve([]);
      }
      if (/FROM player_progress/.test(text)) {
        const rows = [];
        for (const [key, value] of store) {
          const [architectId, flag] = key.split('\u0000');
          if (architectId === values[0]) rows.push({ flag, value });
        }
        return Promise.resolve(rows);
      }
      return Promise.resolve([]);
    }
    return { tag, calls, store };
  }

  test('save then get returns the flags; unknown architect returns none', async () => {
    const { tag, calls } = fakeSql();
    const saved = await saveProgress(tag, 'arch-1', {
      'refrax.v3.complete': 'true',
      'quantum.global.points': '14',
      'quantum.chamber.refrax.earned': '6',
    });
    assert.equal(saved.saved, 3);
    assert.equal(calls.length, 3);
    assert.ok(calls.every((c) => /ON CONFLICT \(architect_id, flag\)/.test(c.text)), 'upsert per flag');
    const got = await getProgress(tag, 'arch-1');
    assert.deepEqual(got.flags, {
      'refrax.v3.complete': 'true',
      'quantum.global.points': '14',
      'quantum.chamber.refrax.earned': '6',
    });
    const missing = await getProgress(tag, 'arch-nobody');
    assert.deepEqual(missing.flags, {});
  });

  test('non-allowlisted flags are ignored', async () => {
    const { tag } = fakeSql();
    const saved = await saveProgress(tag, 'arch-2', {
      'magnetica.v3.complete': 'true',
      'evil.flag': 'true',
      'operator_id': 'STRAND 1534',
    });
    assert.equal(saved.saved, 1);
    const got = await getProgress(tag, 'arch-2');
    assert.deepEqual(got.flags, { 'magnetica.v3.complete': 'true' });
  });

  test('allowlist covers all four chambers plus points', () => {
    assert.equal(PROGRESS_KEYS.length, 9);
    for (const ch of ['refrax', 'magnetica', 'chrona', 'violetflicker']) {
      assert.ok(PROGRESS_KEYS.includes(`${ch}.v3.complete`), ch);
      assert.ok(PROGRESS_KEYS.includes(`quantum.chamber.${ch}.earned`), ch);
    }
    assert.ok(PROGRESS_KEYS.includes('quantum.global.points'));
  });
});

describe('restore includes continuum data (server wiring)', () => {
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const schemaSrc = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');

  test('progress routes and table exist', () => {
    assert.ok(serverSrc.includes("app.post('/api/progress'"), 'POST /api/progress');
    assert.ok(serverSrc.includes("app.get('/api/progress'"), 'GET /api/progress');
    assert.ok(serverSrc.includes("require('./server/player-progress')"), 'store module loaded');
    assert.ok(schemaSrc.includes('CREATE TABLE IF NOT EXISTS player_progress'), 'table in schema.sql');
  });

  test('continuum Qbits restore: scope=continuum returns origin rows', () => {
    const at = serverSrc.indexOf("scope === 'continuum'");
    assert.ok(at !== -1, 'continuum scope branch exists');
    const span = serverSrc.slice(at, at + 800);
    assert.ok(span.includes('origin'), 'origin columns selected');
    assert.ok(span.includes('architect_id'), 'scoped to the restored architect');
  });

  test('level restores: difficulty is computed from stored continuum_results', () => {
    const routesSrc = fs.readFileSync(
      path.join(__dirname, '..', 'server', 'continuum-routes.js'), 'utf8');
    assert.ok(
      routesSrc.includes('SELECT passed FROM continuum_results WHERE architect_id ='),
      'recent results read by architect_id');
    assert.ok(
      routesSrc.includes('INSERT INTO continuum_results (architect_id, challenge_id, passed)'),
      'results recorded by architect_id');
  });
});

describe('Meta timeouts raised, reasoning stays minimal', () => {
  test('both Meta clients default to 25s and minimal reasoning', () => {
    const metaChat = require('../server/meta-chat');
    const continuumMeta = require('../server/continuum-meta');
    assert.equal(metaChat.DEFAULT_TIMEOUT_MS, 25000);
    assert.equal(continuumMeta.DEFAULT_TIMEOUT_MS, 25000);
    assert.equal(metaChat.REASONING_EFFORT, 'minimal');
    assert.equal(continuumMeta.REASONING_EFFORT, 'minimal');
  });
});

describe('landing: gate hook, new link text, restore applies progress', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

  test('Begin Restoration runs through the save gate', () => {
    assert.ok(src.includes('showSaveGate({ onConfirmed: proceedToEntry })'), 'gate wraps entry');
    assert.ok(src.includes('function proceedToEntry()'), 'entry logic preserved');
  });

  test('returning link keeps its place and style with the new text', () => {
    assert.ok(
      src.includes('<a href="#" id="returningLink" class="returning-link">I&rsquo;ve been here before &middot; enter my Operator Code</a>'),
      'exact link text, same element');
  });

  test('restore uses the existing route, errors clearly, applies progress', () => {
    assert.ok(src.includes('OperatorID.lookup(val)'), 'existing restore route');
    assert.ok(src.includes('ID not found'), 'clear unknown-code error');
    assert.ok(src.includes('markRestored()'), 'restored players skip the gate');
    assert.ok(src.includes('fetchProgress(data.architect_id)'), 'progress pulled on restore');
    assert.ok(src.includes('quantum.global.points'), 'points applied to localStorage');
    assert.ok(src.includes('v3\\.complete'), 'unlock flags applied to localStorage');
  });
});

describe('always-visible header code', () => {
  test('resonance: Operator label plus copy button, gate, and backup', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'resonance.html'), 'utf8');
    assert.ok(src.includes("'Operator ' + opId + ' · keep this code'"), 'header label format');
    assert.ok(src.includes('operatorCopyBtn'), 'copy button');
    assert.ok(src.includes('showSaveGate({})'), 'gate safety net');
    assert.ok(src.includes('syncProgress(progressFlags)'), 'progress backup on load');
  });

  test('continuum: operator badge plus copy button', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'continuum.html'), 'utf8');
    assert.ok(src.includes('<script src="/js/operator-id.js"></script>'), 'operator-id.js loaded');
    assert.ok(src.includes('id="operatorCodeLabel"'), 'badge element');
    assert.ok(src.includes("'Operator ' + opId + ' · keep this code'"), 'badge label format');
    assert.ok(src.includes('id="operatorCopyBtn"'), 'copy button');
  });
});

describe('chambers back up unlocks at completion (all four)', () => {
  for (const ch of ['refrax', 'magnetica', 'chrona', 'violetflicker']) {
    test(`${ch}: completion syncs flag plus points`, () => {
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'chambers', `${ch}.js`), 'utf8');
      assert.ok(src.includes('syncProgress({'), `${ch} calls syncProgress`);
      assert.ok(src.includes(`'${ch}.v3.complete': 'true'`), `${ch} uploads its flag`);
      assert.ok(src.includes(`getChamberPoints('${ch}')`), `${ch} uploads its points`);
      assert.ok(src.includes('getTotal()'), `${ch} uploads the total`);
      const html = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'chambers', `${ch}.html`), 'utf8');
      assert.ok(html.includes('<script defer src="/js/operator-id.js"></script>'), `${ch} loads operator-id.js`);
    });
  }
});
