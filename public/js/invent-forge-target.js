// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
// Invent forge target (hackathon step 19f).
//
// Chooses which Forge mission (and guardian page) an Invent request routes
// to, from the solver's forgeability proof: the Invent role's reqAll combo
// is one boost's full tag-set plus 1-2 fix tags. The mission picked is the
// first in canonical order whose best solution covers the combo's boost
// tags, tie-broken by fix-tag overlap. The guardian is the default forge
// page (all four pages host all five missions); it travels as a URL
// parameter so guardian selection routes without interrupting the trip.
//
// Loaded in the browser via a plain <script> tag (window.InventForgeTarget;
// continuum-capabilities.js first) and in Node via require(). No DOM, no
// I/O, no randomness.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./continuum-capabilities'));
  } else {
    root.InventForgeTarget = factory(root.ContinuumCapabilities || null);
  }
})(typeof self !== 'undefined' ? self : this, function (caps) {
  'use strict';

  var BOOST_TAG_MAP = (caps && caps.BOOST_TAG_MAP) || {
    'PH~': ['phase-lock'],
    'N0': ['ground'],
    'EN≡': ['entangle'],
    'G0': ['tunnel'],
  };
  var FIX_TAG_MAP = (caps && caps.FIX_TAG_MAP) || {
    'SH': 'superposition',
    'F::': 'phase-control',
    'C//': 'collapse',
  };
  var deriveCapabilities = (caps && caps.deriveCapabilities) || function (qbit) {
    var tags = [];
    var boostTags = Object.prototype.hasOwnProperty.call(BOOST_TAG_MAP, qbit && qbit.boost)
      ? BOOST_TAG_MAP[qbit.boost]
      : ['hybrid'];
    for (var i = 0; i < boostTags.length; i++) {
      if (tags.indexOf(boostTags[i]) === -1) tags.push(boostTags[i]);
    }
    var fixes = (qbit && Array.isArray(qbit.fixes)) ? qbit.fixes : [];
    for (var j = 0; j < fixes.length; j++) {
      var tag = Object.prototype.hasOwnProperty.call(FIX_TAG_MAP, fixes[j]) ? FIX_TAG_MAP[fixes[j]] : null;
      if (tag && tags.indexOf(tag) === -1) tags.push(tag);
    }
    return tags;
  };

  var DEFAULT_GUARDIAN = 'refrax';

  var MISSION_ORDER = [
    'harmonic_tuning',
    'entanglement',
    'coherence_stitching',
    'energy_absorption',
    'stealth_masking',
  ];

  // Fixes + boost per solution, mirroring the forge pages' MISSIONS tables
  // (parts never affect capability tags). Pinned against
  // server/machine-context.js by tests/continuum-task19f.test.js.
  var MISSION_SOLUTIONS = {
    harmonic_tuning: [
      { fixes: ['F::', 'C//'], boost: 'PH~' },
      { fixes: ['F::', 'C//'], boost: 'N0' },
    ],
    entanglement: [
      { fixes: ['SH', 'F::'], boost: 'EN≡' },
      { fixes: ['SH', 'C//'], boost: 'N0' },
    ],
    coherence_stitching: [
      { fixes: ['SH', 'F::'], boost: 'N0' },
      { fixes: ['SH', 'F::'], boost: 'PH~' },
    ],
    energy_absorption: [
      { fixes: ['SH', 'C//'], boost: 'N0' },
      { fixes: ['SH', 'C//'], boost: 'N0' },
    ],
    stealth_masking: [
      { fixes: ['F::', 'C//'], boost: 'G0' },
      { fixes: ['SH', 'C//'], boost: 'G0' },
    ],
  };

  // inventComboTags(challenge): the reqAll tag list of the Invent role, or
  // null when the challenge carries no Invent combo.
  function inventComboTags(challenge) {
    var roles = challenge && Array.isArray(challenge.roles) ? challenge.roles : [];
    for (var i = 0; i < roles.length; i++) {
      var reqAll = roles[i] && roles[i].reqAll;
      if (Array.isArray(reqAll) && reqAll.length > 0) return reqAll.slice();
    }
    return null;
  }

  // splitCombo(tags): which boost's tag-set the combo carries, plus the rest
  // (fix tags). Unknown boost tags match nothing.
  function splitCombo(tags) {
    var boostTags = [];
    var found = false;
    for (var boost in BOOST_TAG_MAP) {
      if (!Object.prototype.hasOwnProperty.call(BOOST_TAG_MAP, boost)) continue;
      var set = BOOST_TAG_MAP[boost];
      var covered = set.length > 0;
      for (var i = 0; i < set.length; i++) {
        if (tags.indexOf(set[i]) === -1) { covered = false; break; }
      }
      if (covered) { boostTags = set.slice(); found = true; break; }
    }
    if (!found) return { boostTags: [], fixTags: tags.slice() };
    return {
      boostTags: boostTags,
      fixTags: tags.filter(function (t) { return boostTags.indexOf(t) === -1; }),
    };
  }

  function containsAll(haystack, needles) {
    for (var i = 0; i < needles.length; i++) {
      if (haystack.indexOf(needles[i]) === -1) return false;
    }
    return true;
  }

  // chooseInventForgeTarget(challenge): {mission, guardian}, or null without
  // an Invent combo. The boost is the hard constraint (only one boost yields
  // each tag); fix overlap breaks ties; mission order breaks the rest.
  function chooseInventForgeTarget(challenge) {
    var combo = inventComboTags(challenge);
    if (!combo) return null;
    var split = splitCombo(combo);
    var best = null;
    for (var m = 0; m < MISSION_ORDER.length; m++) {
      var mission = MISSION_ORDER[m];
      var solutions = MISSION_SOLUTIONS[mission] || [];
      for (var s = 0; s < solutions.length; s++) {
        var tags = deriveCapabilities({ fixes: solutions[s].fixes, boost: solutions[s].boost });
        var boostOk = split.boostTags.length > 0 && containsAll(tags, split.boostTags) ? 1 : 0;
        var fixHit = 0;
        for (var f = 0; f < split.fixTags.length; f++) {
          if (tags.indexOf(split.fixTags[f]) !== -1) fixHit += 1;
        }
        if (!best || boostOk > best.boostOk || (boostOk === best.boostOk && fixHit > best.fixHit)) {
          best = { mission: mission, boostOk: boostOk, fixHit: fixHit };
        }
      }
    }
    if (!best) return null;
    return { mission: best.mission, guardian: DEFAULT_GUARDIAN };
  }

  return {
    DEFAULT_GUARDIAN: DEFAULT_GUARDIAN,
    MISSION_ORDER: MISSION_ORDER,
    MISSION_SOLUTIONS: MISSION_SOLUTIONS,
    inventComboTags: inventComboTags,
    chooseInventForgeTarget: chooseInventForgeTarget,
  };
});
