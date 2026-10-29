'use strict';
// Hackathon step 16: chamber background fix, rationale voice, bubble
// auto-hide on desktop, continuum right-column room.
// (node:test + node:assert only; no network.)
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const analysis = require('../server/continuum-analysis');

const CHAMBERS = [
  'public/chambers/refrax.html',
  'public/chambers/magnetica.html',
  'public/chambers/chrona.html',
  'public/chambers/violetflicker.html',
  'public/refrax.html',
];

describe('1: chamber backgrounds cover tall pages', () => {
  test('html carries the dark base; body uses min-height + fixed attachment', () => {
    for (const file of CHAMBERS) {
      const src = fs.readFileSync(path.join(root, file), 'utf8');
      assert.ok(src.includes('html{height:100%;background:#05070d}'), `${file}: html base`);
      assert.ok(src.includes('body{min-height:100%}'), `${file}: body min-height`);
      assert.ok(!src.includes('html,body{height:100%}'), `${file}: old clamp gone`);
      assert.ok(
        src.includes('background-attachment:fixed') || /background:[^;]*\bfixed\b/.test(src),
        `${file}: fixed attachment`);
    }
  });

  test('existing background layers untouched', () => {
    for (const file of CHAMBERS) {
      const src = fs.readFileSync(path.join(root, file), 'utf8');
      assert.ok(/url\("[^)]+\) center\/cover/.test(src), `${file}: layers kept`);
    }
  });
});

describe('2: rationale speaks in the Continuum voice', () => {
  test('internal terms reject to the voiced fallback', () => {
    const pool = [{ id: 1, name: 'Alpha Qbit', capabilities: ['entangle'] }];
    const fallback = 'You\'re new to the network, so I\'m starting with one capability per role.';
    for (const bad of [
      'Testing your tags today.',
      'Level 1 needs one tag per role.',
      'This difficulty suits you.',
      'A prompt about linking.',
    ]) {
      assert.equal(analysis.rationaleLine(bad, pool, 1, 'available'), fallback, bad);
    }
  });

  test('fallbacks are voiced, short, and clean', () => {
    for (const [difficulty, mode] of [[1, 'available'], [2, 'available'], [3, 'available'], [3, 'invent']]) {
      const line = analysis.fallbackRationale(difficulty, mode);
      assert.ok(line.split(/\s+/).length <= 20, `${line}: max 20 words`);
      assert.ok(/you're|you've|i'm/i.test(line), `${line}: speaks to the player`);
      assert.ok(!/\btags?\b|\blevel 1 needs\b|\bdifficulty\b|\bprompt\b/i.test(line), `${line}: no internal terms`);
    }
    assert.equal(
      analysis.fallbackRationale(1, 'available'),
      'You\'re new to the network, so I\'m starting with one capability per role.');
  });

  test('prompt teaches the voice with the example', () => {
    const src = fs.readFileSync(path.join(root, 'server', 'continuum-meta.js'), 'utf8');
    assert.ok(src.includes('Continuum') && src.includes('own voice'), 'voice instruction');
    assert.ok(src.includes('tags, level 1 needs, difficulty, prompt'), 'terms listed');
    assert.ok(src.includes('at most 20 words'), 'length cap restated');
  });
});

describe('3: greeting bubble auto-hides on every screen', () => {
  test('showBubble always arms the 8s timer', () => {
    const src = fs.readFileSync(path.join(root, 'public', 'js', 'machine-guide.js'), 'utf8');
    const at = src.indexOf('function showBubble');
    assert.ok(at !== -1, 'showBubble exists');
    const fn = src.slice(at, src.indexOf('function hideBubble'));
    assert.ok(fn.includes('8000'), '8s timer');
    assert.ok(!fn.includes('isNarrow'), 'no narrow-only gate');
    assert.ok(!src.includes('function isNarrow'), 'gate helper removed');
  });
});

describe('4: inventory keeps room; analysis scrolls (step 17: panel moved, constraints reverted)', () => {
  const src = fs.readFileSync(path.join(root, 'public', 'continuum.html'), 'utf8');

  test('min/max-height constraints removed; inventory uses the full column', () => {
    assert.ok(!src.includes('#inventory { min-height: 300px; }'), 'desktop min-height gone');
    assert.ok(!src.includes('#inventory { min-height: 240px; }'), 'narrow min-height gone');
    assert.ok(!src.includes('#networkAnalysis'), 'capped panel gone');
    assert.ok(src.includes('id="inventory"'), 'inventory keeps its place');
  });

  test('newest typed line stays in view', () => {
    const at = src.indexOf('function typeAnalysisLines');
    assert.ok(at !== -1, 'typer exists');
    const fn = src.slice(at, at + 2200);
    assert.ok(fn.includes('box.scrollTop = box.scrollHeight'), 'scroll follows typing');
  });

  test('card styles and column width untouched', () => {
    assert.ok(src.includes('.qbit-card:hover { transform: translateY(-2px);'), 'card CSS unchanged');
    assert.ok(src.includes('lg:grid-cols-3'), 'column grid unchanged');
  });
});
