'use strict';
// Hackathon step 12: canonical Qbit capabilities, recipe cards,
// function-phrased needs, hint tag reveal, visible levels.
// (node:test + node:assert only). No network, no PGlite.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const shared = require('../public/js/continuum-capabilities');
const rules = require('../server/continuum-rules');
const seedQbits = require('../db/seed/community-qbits.json');

const OLD_TAGS = ['timing', 'high-phase', 'magnetic', 'ultra-stable', 'optical', 'stealth'];

describe('canonical vocabulary: one mapping for every boost and fix', () => {
  test('each boost derives exactly its canonical tag', () => {
    assert.deepEqual(shared.deriveCapabilities({ boost: 'PH~' }), ['phase-lock']);
    assert.deepEqual(shared.deriveCapabilities({ boost: 'N0' }), ['ground']);
    assert.deepEqual(shared.deriveCapabilities({ boost: 'EN≡' }), ['entangle']);
    assert.deepEqual(shared.deriveCapabilities({ boost: 'G0' }), ['tunnel']);
    assert.deepEqual(shared.deriveCapabilities({ boost: 'XX' }), ['hybrid']);
  });

  test('each fix adds exactly its canonical tag', () => {
    assert.deepEqual(shared.deriveCapabilities({ boost: 'PH~', fixes: ['SH'] }),
      ['phase-lock', 'superposition']);
    assert.deepEqual(shared.deriveCapabilities({ boost: 'N0', fixes: ['F::'] }),
      ['ground', 'phase-control']);
    assert.deepEqual(shared.deriveCapabilities({ boost: 'G0', fixes: ['C//'] }),
      ['tunnel', 'collapse']);
  });

  test('server re-exports the one shared mapping and phrase helpers', () => {
    assert.equal(rules.CAPABILITY_VOCAB, shared.CAPABILITY_VOCAB);
    assert.equal(rules.TAG_PHRASES, shared.TAG_PHRASES);
    assert.equal(rules.needsTextForRole, shared.needsTextForRole);
    assert.deepEqual(rules.CAPABILITY_VOCAB, [
      'phase-lock', 'ground', 'entangle', 'tunnel',
      'hybrid', 'superposition', 'phase-control', 'collapse',
    ]);
  });
});

describe('old tag names appear nowhere in server/ or continuum.html', () => {
  const files = fs.readdirSync(path.join(__dirname, '..', 'server'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join('server', f))
    .concat(['public/continuum.html']);

  test('no quoted old-tag literals (prose and mission names untouched)', () => {
    const pattern = new RegExp(`['"](${OLD_TAGS.join('|')})['"]`);
    for (const rel of files) {
      const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
      assert.ok(!pattern.test(src), `${rel} must not contain old tag literals`);
    }
  });

  test('mission-domain prose using those words is preserved, not scrubbed', () => {
    const metaSrc = fs.readFileSync(
      path.join(__dirname, '..', 'server', 'continuum-meta.js'), 'utf8');
    assert.ok(metaSrc.includes('stealth masking'), 'mission prose kept');
    const page = fs.readFileSync(
      path.join(__dirname, '..', 'public', 'continuum.html'), 'utf8');
    assert.ok(page.includes('stealth_masking'), 'mission id kept');
  });
});

describe('function-phrased needs from the fixed map', () => {
  test('phrase map covers the whole vocabulary with the exact phrases', () => {
    assert.deepEqual(shared.TAG_PHRASES, {
      'phase-lock': 'keep quantum states synchronized until energy is released on cue',
      'ground': 'drain noise into a quiet ground',
      'entangle': 'link distant quantum states so their outcomes are correlated',
      'tunnel': 'create a tunneling pathway through a barrier',
      'superposition': 'hold every path open at once',
      'phase-control': 'shift the interference fringes',
      'collapse': 'end the overlap and keep one clear result',
      'hybrid': 'adapt across domains',
    });
    assert.deepEqual(Object.keys(shared.TAG_PHRASES).sort(), [...shared.CAPABILITY_VOCAB].sort());
  });

  test('reqAll reads "Must X and Y (one Qbit does both)"', () => {
    assert.equal(
      shared.needsTextForRole({ reqAll: ['phase-lock', 'collapse'] }),
      'Must keep quantum states synchronized until energy is released on cue and end the overlap and keep one clear result (one Qbit does both)');
  });

  test('req reads "Needs a Qbit that can X or Y" (step 13: verb phrases need a subject)', () => {
    assert.equal(
      shared.needsTextForRole({ req: ['ground'] }),
      'Needs a Qbit that can drain noise into a quiet ground');
    assert.equal(
      shared.needsTextForRole({ req: ['entangle', 'tunnel'] }),
      'Needs a Qbit that can link distant quantum states so their outcomes are correlated or create a tunneling pathway through a barrier');
  });

  test('server attaches the phrasing to every response role', () => {
    const routesSrc = fs.readFileSync(
      path.join(__dirname, '..', 'server', 'continuum-routes.js'), 'utf8');
    assert.ok(routesSrc.includes('needs: needsTextForRole(role)'), 'toResponseRoles attaches needs');
  });

  test('page renders the server phrasing, tags only after ASK NETWORK', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'continuum.html'), 'utf8');
    const at = page.indexOf('function roleNeedsText(role)');
    assert.ok(at !== -1, 'roleNeedsText exists');
    const fn = page.slice(at, at + 1400);
    assert.ok(fn.includes('role.needs'), 'prefers the server phrasing');
    assert.ok(fn.includes('needsTextForRole(role)'), 'shared helper covers the local fallback');
    assert.ok(fn.includes('hintUsedForChallenge'), 'tag labels gated on the spent hint');
  });
});

describe('cards show the recipe, never raw tags before the hint', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'continuum.html'), 'utf8');

  test('canonical boost/fix/part names', () => {
    for (const name of ['PhaseLock', 'Null', 'Entangle', 'Ghost']) {
      assert.ok(page.includes(`'${name}'`) || page.includes(`: '${name}'`), `boost name ${name}`);
    }
    for (const name of ['Superpose', 'FringeGate', 'Collapse']) {
      assert.ok(page.includes(name), `fix name ${name}`);
    }
    assert.ok(page.includes('Shimmer Splitter'), 'part names mapped');
    assert.ok(page.includes('Boost: ${name} (${qbit.boost})'), 'boost recipe line');
    assert.ok(page.includes('Fixes: '), 'fixes recipe line');
    assert.ok(page.includes('Parts: '), 'parts recipe line');
  });

  test('raw tag line exists only inside the hint-gated branch', () => {
    const at = page.indexOf('function renderInventory()');
    assert.ok(at !== -1, 'renderInventory exists');
    const fn = page.slice(at, at + 4800); // step 15 adds the NEW-tag lines above the recipe
    assert.ok(fn.includes('recipeLines(q)'), 'cards render the recipe');
    const tagLine = fn.split('\n').find((line) => line.includes("capabilityTags || []).join(' · ')"));
    assert.ok(tagLine, 'a tag line exists for the hint reveal');
    assert.ok(tagLine.includes('hintUsedForChallenge'), 'tag line is gated on the spent hint');
    assert.ok(!fn.includes('profileText'), 'no specialty tag line on cards');
  });

  test('ASK NETWORK re-renders slots so tags appear there too', () => {
    const at = page.indexOf('function askNetworkHint()');
    assert.ok(at !== -1, 'askNetworkHint exists');
    const fn = page.slice(at, at + 2600);
    assert.ok(fn.includes('renderSlots()'), 'slots re-rendered on hint');
    assert.ok(fn.includes('renderInventory()'), 'cards re-rendered on hint');
  });
});

describe('offline templates still solvable from the seed pool', () => {
  const { OFFLINE_TEMPLATES } = require('../server/continuum-routes');

  function seedCandidates() {
    return seedQbits.map((qbit, index) => ({
      id: `seed-${index}`,
      name: qbit.name,
      capabilities: rules.deriveCapabilities(qbit),
    }));
  }

  test('both remapped templates validate against the real seed', () => {
    assert.equal(OFFLINE_TEMPLATES.length, 2);
    for (const template of OFFLINE_TEMPLATES) {
      const verdict = rules.validateChallenge(
        { title: template.name, brief: template.desc, roles: template.roles },
        seedCandidates()
      );
      assert.deepEqual(verdict, { ok: true }, `${template.id} must stay solvable`);
    }
  });

  test('remap preserves intent: anchor+stabilizer, bridge+sync', () => {
    const [rift, cascade] = OFFLINE_TEMPLATES;
    assert.deepEqual(rift.roles.map((r) => r.req), [['phase-lock'], ['ground']]);
    assert.deepEqual(cascade.roles.map((r) => r.req), [['entangle'], ['phase-lock']]);
  });
});

describe('stored rows and recipes untouched: tags are derived at runtime', () => {
  test('seed rows store boost/fixes/parts, never tags', () => {
    assert.ok(seedQbits.length > 0, 'seed is non-empty');
    for (const qbit of seedQbits) {
      assert.ok(['PH~', 'N0', 'EN≡', 'G0'].includes(qbit.boost), `${qbit.name} keeps its boost`);
      assert.ok(Array.isArray(qbit.fixes), `${qbit.name} keeps its fixes`);
      assert.ok(Array.isArray(qbit.parts), `${qbit.name} keeps its parts`);
      assert.equal(qbit.capabilities, undefined, 'no stored capabilities');
      assert.equal(qbit.tags, undefined, 'no stored tags');
    }
    const raw = fs.readFileSync(
      path.join(__dirname, '..', 'db', 'seed', 'community-qbits.json'), 'utf8');
    for (const tag of shared.CAPABILITY_VOCAB) {
      assert.ok(!raw.includes(`"${tag}"`), `seed stores no "${tag}" strings`);
    }
  });
});

describe('Meta prompts: entanglement correlates, never communicates', () => {
  test('both system prompts carry the guard line', () => {
    for (const rel of ['server/continuum-meta.js', 'server/continuum-interpret.js']) {
      const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
      assert.ok(src.includes('Entanglement correlates distant outcomes'), `${rel} guard`);
      assert.ok(src.includes('communication, messaging, or signaling'), `${rel} banned phrasings`);
    }
  });
});

describe('levels visible and felt', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'continuum.html'), 'utf8');

  test('badge next to the flames with the three titles', () => {
    assert.ok(page.includes('id="levelBadge"'), 'badge element');
    assert.ok(page.includes("LEVEL_NAMES = { 1: 'Apprentice', 2: 'Engineer', 3: 'Inventor' }"), 'titles');
    assert.ok(page.includes('Level ${clamped}'), 'badge text format');
  });

  test('change detected against sessionStorage, once per change', () => {
    assert.ok(page.includes("sessionStorage.getItem('continuum.lastLevel')"), 'reads last level');
    assert.ok(page.includes("sessionStorage.setItem('continuum.lastLevel'"), 'stores last level');
    assert.ok(page.includes('function updateLevelBadge(level)'), 'badge updater');
  });

  test('up and down moments with the exact messages', () => {
    assert.ok(page.includes('level-up-flare'), 'flare class');
    assert.ok(page.includes('badge-pulse'), 'badge pulse');
    assert.ok(page.includes('Your record holds. The Continuum raises the stakes.'), 'up message');
    assert.ok(page.includes('level-dim'), 'dim class');
    assert.ok(page.includes('The Continuum eases the load. Recalibrate.'), 'down message');
  });

  test('flame life per level, CSS only, reduced-motion respected', () => {
    assert.ok(page.includes('flames-l1') && page.includes('flames-l2') && page.includes('flames-l3'), 'level classes');
    assert.ok(page.includes('@keyframes flameFlicker'), 'flicker keyframes');
    assert.ok(page.includes('@media (prefers-reduced-motion: reduce)'), 'reduced-motion guard');
  });
});
