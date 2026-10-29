'use strict';
// Tests for server/continuum-rules.js (node:test + node:assert only).
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  CAPABILITY_VOCAB,
  deriveCapabilities,
  validateChallenge,
  checkSolution,
  selectCandidates,
} = require('../server/continuum-rules');

describe('CAPABILITY_VOCAB', () => {
  test('exact fixed vocabulary', () => {
    assert.deepEqual(CAPABILITY_VOCAB, [
      'phase-lock',
      'ground',
      'entangle',
      'tunnel',
      'hybrid',
      'superposition',
      'phase-control',
      'collapse',
    ]);
  });
});

describe('deriveCapabilities', () => {
  test('PH~ boost maps to phase-lock', () => {
    assert.deepEqual(deriveCapabilities({ boost: 'PH~' }), ['phase-lock']);
  });
  test('N0 boost maps to ground', () => {
    assert.deepEqual(deriveCapabilities({ boost: 'N0' }), ['ground']);
  });
  test('EN≡ boost maps to entangle', () => {
    assert.deepEqual(deriveCapabilities({ boost: 'EN≡' }), ['entangle']);
  });
  test('G0 boost maps to tunnel', () => {
    assert.deepEqual(deriveCapabilities({ boost: 'G0' }), ['tunnel']);
  });
  test('unknown boost maps to hybrid', () => {
    assert.deepEqual(deriveCapabilities({ boost: 'XX' }), ['hybrid']);
    assert.deepEqual(deriveCapabilities({ boost: '' }), ['hybrid']);
    assert.deepEqual(deriveCapabilities({}), ['hybrid']);
    assert.deepEqual(deriveCapabilities(null), ['hybrid']);
    assert.deepEqual(deriveCapabilities(undefined), ['hybrid']);
  });
  test('deterministic: same input twice gives equal output', () => {
    assert.deepEqual(deriveCapabilities({ boost: 'PH~' }), deriveCapabilities({ boost: 'PH~' }));
  });
});

function solvableChallenge() {
  return {
    title: 'Stabilize the Rift',
    brief: 'Hold the fracture steady while the bridge relinks.',
    roles: [
      { id: 'r1', name: 'Phase Anchor', req: ['phase-lock'] },
      { id: 'r2', name: 'Stabilizer', req: ['ground'] },
    ],
  };
}

function solvableCandidates() {
  return [
    { id: 'a', name: 'Anchor', capabilities: ['phase-lock'] },
    { id: 'b', name: 'Ground', capabilities: ['ground'] },
  ];
}

describe('validateChallenge', () => {
  test('accepts a solvable plain-text challenge', () => {
    assert.deepEqual(validateChallenge(solvableChallenge(), solvableCandidates()), { ok: true });
  });
  test('accepts ANY-of req satisfied by either tag', () => {
    const challenge = {
      title: 'Bridge Test',
      brief: 'Link the nodes.',
      roles: [
        { id: 'r1', name: 'Bridge', req: ['entangle', 'ground'] },
        { id: 'r2', name: 'Clock', req: ['phase-lock'] },
      ],
    };
    const candidates = [
      { id: 'a', capabilities: ['ground'] },
      { id: 'b', capabilities: ['phase-lock'] },
    ];
    assert.deepEqual(validateChallenge(challenge, candidates), { ok: true });
  });
  test('rejects unsolvable challenge', () => {
    const candidates = [
      { id: 'a', capabilities: ['entangle'] },
      { id: 'b', capabilities: ['tunnel'] },
    ];
    const verdict = validateChallenge(solvableChallenge(), candidates);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason, /distinct/i);
  });
  test('rejects when only one Qbit could fill both roles', () => {
    const challenge = {
      title: 'Double Duty',
      brief: 'Two lock roles.',
      roles: [
        { id: 'r1', name: 'Lock A', req: ['phase-lock'] },
        { id: 'r2', name: 'Lock B', req: ['phase-lock'] },
      ],
    };
    const candidates = [
      { id: 'only', capabilities: ['phase-lock'] },
      { id: 'other', capabilities: ['entangle'] },
    ];
    const verdict = validateChallenge(challenge, candidates);
    assert.equal(verdict.ok, false);
  });
  test('rejects unknown capability tag', () => {
    const challenge = solvableChallenge();
    challenge.roles[1].req = ['teleport'];
    const verdict = validateChallenge(challenge, solvableCandidates());
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason, /unknown capability tag/);
  });
  test('rejects wrong role counts', () => {
    const one = { ...solvableChallenge(), roles: solvableChallenge().roles.slice(0, 1) };
    assert.equal(validateChallenge(one, solvableCandidates()).ok, false);
    const three = solvableChallenge();
    three.roles.push({ id: 'r3', name: 'Extra', req: ['hybrid'] });
    assert.equal(validateChallenge(three, solvableCandidates()).ok, false);
  });
  test('rejects empty req list', () => {
    const challenge = solvableChallenge();
    challenge.roles[0].req = [];
    assert.equal(validateChallenge(challenge, solvableCandidates()).ok, false);
  });
  test('rejects HTML in title, brief, and role names', () => {
    const base = solvableCandidates();
    const t = solvableChallenge();
    t.title = 'Fix the <b>rift</b>';
    assert.equal(validateChallenge(t, base).ok, false);
    const b = solvableChallenge();
    b.brief = 'Hold it steady > now';
    assert.equal(validateChallenge(b, base).ok, false);
    const r = solvableChallenge();
    r.roles[0].name = '<Anchor>';
    assert.equal(validateChallenge(r, base).ok, false);
  });
  test('rejects URLs and @mentions', () => {
    const base = solvableCandidates();
    const u1 = solvableChallenge();
    u1.brief = 'See http://example.com for details';
    assert.equal(validateChallenge(u1, base).ok, false);
    const u2 = solvableChallenge();
    u2.title = 'Visit www.example.com now';
    assert.equal(validateChallenge(u2, base).ok, false);
    const u3 = solvableChallenge();
    u3.roles[1].name = 'Ask @ops team';
    assert.equal(validateChallenge(u3, base).ok, false);
  });
  test('rejects overlong text', () => {
    const base = solvableCandidates();
    const t = solvableChallenge();
    t.title = 'x'.repeat(61);
    assert.equal(validateChallenge(t, base).ok, false);
    const b = solvableChallenge();
    b.brief = 'y'.repeat(241);
    assert.equal(validateChallenge(b, base).ok, false);
    const r = solvableChallenge();
    r.roles[0].name = 'z'.repeat(41);
    assert.equal(validateChallenge(r, base).ok, false);
  });
  test('accepts max-length boundaries', () => {
    const challenge = {
      title: 't'.repeat(60),
      brief: 'b'.repeat(240),
      roles: [
        { id: 'r1', name: 'n'.repeat(40), req: ['phase-lock'] },
        { id: 'r2', name: 'Second', req: ['ground'] },
      ],
    };
    const candidates = [
      { id: 'a', capabilities: ['phase-lock'] },
      { id: 'b', capabilities: ['ground'] },
    ];
    assert.deepEqual(validateChallenge(challenge, candidates), { ok: true });
  });
  test('derives capabilities from raw rows with boost', () => {
    const candidates = [
      { id: 1, boost: 'PH~' },
      { id: 2, boost: 'N0' },
    ];
    assert.deepEqual(validateChallenge(solvableChallenge(), candidates), { ok: true });
  });
});

describe('checkSolution', () => {
  const roles = solvableChallenge().roles;
  test('true for a correct distinct assignment', () => {
    const assigned = [
      { id: 'a', capabilities: ['phase-lock'] },
      { id: 'b', capabilities: ['ground'] },
    ];
    assert.equal(checkSolution(roles, assigned), true);
  });
  test('rejects the same Qbit twice', () => {
    const one = { id: 'a', capabilities: ['phase-lock', 'ground'] };
    assert.equal(checkSolution(roles, [one, one]), false);
    assert.equal(checkSolution(roles, [{ ...one }, { ...one }]), false);
  });
  test('rejects wrong capabilities', () => {
    const assigned = [
      { id: 'a', capabilities: ['phase-lock'] },
      { id: 'b', capabilities: ['entangle'] },
    ];
    assert.equal(checkSolution(roles, assigned), false);
  });
  test('rejects length mismatch and missing entries', () => {
    assert.equal(checkSolution(roles, [{ id: 'a', capabilities: ['phase-lock'] }]), false);
    assert.equal(checkSolution(roles, [null, null]), false);
    assert.equal(checkSolution(roles, 'nope'), false);
  });
  test('derives capabilities from boost when absent', () => {
    assert.equal(checkSolution(roles, [{ id: 1, boost: 'PH~' }, { id: 2, boost: 'N0' }]), true);
  });
});

describe('selectCandidates', () => {
  test('strips private fields, keeps only id/name/owner/capabilities', () => {
    const rows = [
      {
        id: 7,
        name: 'Brave Tuner',
        boost: 'PH~',
        architect_id: 'secret-architect',
        alias: 'secret-alias',
        story: 'secret story',
        image: 'secret.png',
      },
    ];
    const [only] = selectCandidates(rows, [], 12);
    assert.deepEqual(Object.keys(only).sort(), ['capabilities', 'id', 'name', 'owner']);
    assert.deepEqual(only, {
      id: 7,
      name: 'Brave Tuner',
      owner: 'own',
      capabilities: ['phase-lock'],
    });
    assert.ok(!JSON.stringify(only).includes('secret'));
  });
  test('respects limit', () => {
    const own = Array.from({ length: 10 }, (_, i) => ({ id: `o${i}`, name: 'Q', boost: 'G0' }));
    const pub = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: 'Q', boost: 'G0' }));
    assert.equal(selectCandidates(own, pub, 3).length, 3);
    assert.equal(selectCandidates(own, pub).length, 12);
  });
  test('mixes own and community when both exist', () => {
    const own = [{ id: 'o1', name: 'Mine', boost: 'PH~' }];
    const pub = [{ id: 'p1', name: 'Theirs', boost: 'N0' }];
    const owners = selectCandidates(own, pub, 12).map((c) => c.owner).sort();
    assert.deepEqual(owners, ['community', 'own']);
  });
  test('sanitizes names to letters/numbers/spaces/hyphens, max 30', () => {
    const rows = [
      { id: 'a', name: 'Bad<Name>@Here! http://x', boost: 'G0' },
      { id: 'b', name: 'y'.repeat(50), boost: 'G0' },
      { id: 'c', name: '  Well-Formed 9 Name  ', boost: 'G0' },
    ];
    const [a, b, c] = selectCandidates(rows, [], 12);
    assert.equal(a.name, 'BadNameHere httpx');
    assert.equal(b.name.length, 30);
    assert.equal(c.name, 'Well-Formed 9 Name');
  });
  test('skips rows without id', () => {
    const rows = [{ name: 'NoId', boost: 'PH~' }, { id: 'ok', name: 'Ok', boost: 'PH~' }];
    const out = selectCandidates(rows, [], 12);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'ok');
  });
});
