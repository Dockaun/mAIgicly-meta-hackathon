// Continuum capability mapping shared by the server rules and continuum.html.
//
// Single source of truth for boost/fix -> capability tags and for role
// satisfaction (req ANY-of vs reqAll ALL-of). Loaded in the browser via a
// plain <script> tag (window.ContinuumCapabilities) and in Node via require().
// No DOM, no I/O, no randomness.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ContinuumCapabilities = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Canonical boost tag-sets, matching the original Qbit design: one tag
  // per boost (hackathon step 12 revised the earlier two-tag derivations).
  var BOOST_TAG_MAP = {
    'PH~': ['phase-lock'],
    'N0': ['ground'],
    'EN≡': ['entangle'],
    'G0': ['tunnel'],
  };

  // Saved-fix codes (the fixes array on a forged Qbit) to capability tags.
  var FIX_TAG_MAP = {
    'SH': 'superposition',
    'F::': 'phase-control',
    'C//': 'collapse',
  };

  var CAPABILITY_VOCAB = [
    'phase-lock',
    'ground',
    'entangle',
    'tunnel',
    'hybrid',
    'superposition',
    'phase-control',
    'collapse',
  ];

  // TAG_PHRASES: the ONE fixed function-phrase map for slot needs. The
  // server renders role needs text from this (code, never Meta); the page
  // uses it only for the offline local fallback. Entanglement correlates
  // outcomes; it is never communication or signaling.
  var TAG_PHRASES = {
    'phase-lock': 'keep quantum states synchronized until energy is released on cue',
    'ground': 'drain noise into a quiet ground',
    'entangle': 'link distant quantum states so their outcomes are correlated',
    'tunnel': 'create a tunneling pathway through a barrier',
    'superposition': 'hold every path open at once',
    'phase-control': 'shift the interference fringes',
    'collapse': 'end the overlap and keep one clear result',
    'hybrid': 'adapt across domains',
  };

  // normalizeFixes(fixes): the fixes array from a row, a JSON string of one
  // (JSONB selected as text), or anything else -> an array of codes.
  function normalizeFixes(fixes) {
    if (Array.isArray(fixes)) return fixes;
    if (typeof fixes === 'string') {
      try {
        var parsed = JSON.parse(fixes);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  // deriveCapabilities(qbit): boost tags (or ['hybrid'] for any other boost)
  // plus one tag per recognized saved fix. Order is stable: boost tags first
  // in map order, then fix tags in fixes-array order. Duplicates removed.
  function deriveCapabilities(qbit) {
    var tags = [];
    var boost = qbit ? qbit.boost : undefined;
    var boostTags = Object.prototype.hasOwnProperty.call(BOOST_TAG_MAP, boost)
      ? BOOST_TAG_MAP[boost]
      : ['hybrid'];
    for (var i = 0; i < boostTags.length; i++) {
      if (tags.indexOf(boostTags[i]) === -1) tags.push(boostTags[i]);
    }
    var fixes = normalizeFixes(qbit ? qbit.fixes : undefined);
    for (var j = 0; j < fixes.length; j++) {
      var tag = Object.prototype.hasOwnProperty.call(FIX_TAG_MAP, fixes[j])
        ? FIX_TAG_MAP[fixes[j]]
        : null;
      if (tag && tags.indexOf(tag) === -1) tags.push(tag);
    }
    return tags;
  }

  // roleSatisfiedBy(role, capabilities): reqAll means ALL listed tags must be
  // present; req means ANY listed tag is enough. Exactly one of the two must
  // be a non-empty list.
  function roleSatisfiedBy(role, capabilities) {
    if (!role || typeof role !== 'object') return false;
    if (!Array.isArray(capabilities)) return false;
    if (Array.isArray(role.reqAll)) {
      if (role.reqAll.length === 0) return false;
      for (var i = 0; i < role.reqAll.length; i++) {
        if (capabilities.indexOf(role.reqAll[i]) === -1) return false;
      }
      return true;
    }
    if (!Array.isArray(role.req) || role.req.length === 0) return false;
    for (var j = 0; j < role.req.length; j++) {
      if (capabilities.indexOf(role.req[j]) !== -1) return true;
    }
    return false;
  }

  // needsTextForRole(role): function-phrased slot need. reqAll reads
  // "Must X and Y (one Qbit does both)"; req reads "Needs a Qbit that can
  // X" (or "Needs a Qbit that can X or Y"). Every TAG_PHRASES entry starts
  // with a verb, so both forms read grammatically (hackathon step 13).
  function needsTextForRole(role) {
    function phrase(tag) {
      return Object.prototype.hasOwnProperty.call(TAG_PHRASES, tag) ? TAG_PHRASES[tag] : String(tag);
    }
    if (role && Array.isArray(role.reqAll)) {
      return 'Must ' + role.reqAll.map(phrase).join(' and ') + ' (one Qbit does both)';
    }
    var req = (role && Array.isArray(role.req)) ? role.req : [];
    return 'Needs a Qbit that can ' + req.map(phrase).join(' or ');
  }

  return {
    BOOST_TAG_MAP: BOOST_TAG_MAP,
    FIX_TAG_MAP: FIX_TAG_MAP,
    CAPABILITY_VOCAB: CAPABILITY_VOCAB,
    TAG_PHRASES: TAG_PHRASES,
    normalizeFixes: normalizeFixes,
    deriveCapabilities: deriveCapabilities,
    roleSatisfiedBy: roleSatisfiedBy,
    needsTextForRole: needsTextForRole,
  };
});
