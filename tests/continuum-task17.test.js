'use strict';
// Hackathon step 17: thinking stage in the mission box, right-column panel
// removed, stability banner follows the real unlock rules.
// (node:test + node:assert only; no network.)
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('1: thinking stage in the mission box', () => {
  const src = fs.readFileSync(path.join(root, 'public', 'continuum.html'), 'utf8');

  test('thinking title, typed lines, fade, then mission', () => {
    assert.ok(src.includes('id="thinkingLines"'), 'thinking box in mission box');
    assert.ok(src.includes('THE CONTINUUM IS THINKING ...'), 'thinking title');
    assert.ok(src.includes('400 * (index + 1)'), 'about 400ms per line');
    assert.ok(src.includes('transition:opacity 0.5s'), 'half-second fade');
    const at = src.indexOf('function typeAnalysisLines');
    const fn = src.slice(at, at + 2400);
    assert.ok(fn.includes('textContent'), 'text only');
    assert.ok(!fn.includes('innerHTML'), 'no HTML injection');
  });

  test('roles and deploy hide until lines finish, then mission renders', () => {
    assert.ok(src.includes('showThinkingView'), 'thinking view swap');
    assert.ok(src.includes('showMissionView'), 'mission restore');
    const at = src.indexOf('function showThinkingView');
    const fn = src.slice(at, at + 1200);
    assert.ok(fn.includes('roleSlots'), 'roles hidden');
    assert.ok(fn.includes('missionActions'), 'deploy hidden');
    assert.ok(src.includes('renderServerMission'), 'mission renders after thinking');
    assert.ok(src.includes('renderLocalMission'), 'local mission renders after thinking');
  });

  test('replay link under the source line replays in the same box', () => {
    assert.ok(src.includes('How I chose this challenge'), 'replay label');
    const srcIdx = src.indexOf('id="missionSource"');
    const linkIdx = src.indexOf('id="replayAnalysisLink"');
    assert.ok(linkIdx > srcIdx, 'link sits under the source line');
    assert.ok(src.includes('wireReplayLink'), 'replay wired');
  });

  test('reduced motion: all lines at once for 2s, no typing', () => {
    const at = src.indexOf('function typeAnalysisLines');
    const fn = src.slice(at, at + 2400);
    assert.ok(fn.includes('prefersReducedMotion'), 'motion check');
    assert.ok(fn.includes('2000'), '2 seconds');
  });

  test('credit lines land in the mission box result area', () => {
    const at = src.indexOf('function appendNetworkCreditLines');
    const fn = src.slice(at, at + 800);
    assert.ok(fn.includes("getElementById('validationFeedback')"), 'result area target');
    assert.ok(fn.includes('forged by another Operator, solved this with you.'), 'credit text kept');
  });
});

describe('2: right column restored to inventory', () => {
  const src = fs.readFileSync(path.join(root, 'public', 'continuum.html'), 'utf8');

  test('analysis box and step-16 constraints gone', () => {
    assert.ok(!src.includes('Network Analysis'), 'box heading gone');
    assert.ok(!src.includes('networkAnalysis'), 'panel id gone');
    assert.ok(!src.includes('min-height: 300px'), 'desktop min-height gone');
    assert.ok(!src.includes('min-height: 240px'), 'narrow min-height gone');
    assert.ok(!src.includes('max-height: 9rem'), 'panel cap gone');
    assert.ok(src.includes('id="inventory"'), 'inventory keeps the column');
  });
});

describe('3: stability banner follows the real unlock rules', () => {
  const src = fs.readFileSync(path.join(root, 'public', 'continuum.html'), 'utf8');
  const guide = fs.readFileSync(path.join(root, 'server', 'guide.js'), 'utf8');

  test('exact banner texts; no DEMO; full hidden', () => {
    assert.ok(src.includes('UNSTABLE · FORGE 3 QBITS TO STABILIZE'), 'unstable text');
    assert.ok(src.includes('STABLE · RESTORE ALL CHAMBERS AND FORGE MISSIONS FOR FULL POWER'), 'stable text');
    assert.ok(!src.includes('UNSTABLE DEMO'), 'DEMO gone');
    assert.ok(!src.includes('FORGE 5 QBITS'), 'old threshold gone');
    assert.ok(!src.includes('FULL QUANTUM POWER'), 'full banner gone');
  });

  test('thresholds match server/guide.js stages', () => {
    assert.ok(guide.includes("if (p.qbits >= 3) return 'stable'"), 'stable at 3');
    assert.ok(guide.includes("if (p.qbits >= 1) return 'unstable'"), 'unstable below 3');
  });

  test('banner never overlaps mission header or threat level', () => {
    assert.ok(src.includes('stabilityBanner'), 'banner element');
    assert.ok(src.includes("app.style.top = banner.offsetHeight + 'px'"), 'app pushed below banner');
    assert.ok(src.includes("addEventListener('resize', layout)"), 'reflowed on resize');
  });
});
