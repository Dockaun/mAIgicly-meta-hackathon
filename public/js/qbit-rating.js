// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
(function(window) {
  function mapBoostToSpecialty(boost) {
    switch (boost) {
      case 'PH~':
        return { key: 'phase', label: 'Phase Specialist', basePower: 24 };
      case 'EN≡':
        return { key: 'link', label: 'Link Specialist', basePower: 26 };
      case 'N0':
        return { key: 'anchor', label: 'Anchor Specialist', basePower: 28 };
      case 'G0':
        return { key: 'stealth', label: 'Stealth Specialist', basePower: 22 };
      default:
        return { key: 'hybrid', label: 'Hybrid Specialist', basePower: 20 };
    }
  }

  function calculateStability(parts, fixes, boost) {
    let score = 50;

    const structuralParts = ['Mirror', 'Resonator', 'Coil', 'Core', 'Sensor', 'Node', 'Buffer', 'Gate'];
    const volatileParts   = ['Mask', 'Fork', 'Splitter'];

    (parts || []).forEach(p => {
      if (structuralParts.includes(p)) score += 6;
      if (volatileParts.includes(p))  score -= 3;
    });

    (fixes || []).forEach(f => {
      if (f === 'SH')  score += 4;
      if (f === 'F::') score += 2;
      if (f === 'C//') score -= 2;
    });

    if (boost === 'N0') score += 8;
    if (boost === 'G0') score -= 4;

    if (score < 10)  score = 10;
    if (score > 100) score = 100;

    return Math.round(score);
  }

  function hashToUnit(str) {
    if (!str) return 0.5;
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    return (h % 1000) / 1000;
  }

  function calculateRarity(recipe, alias, name) {
    const seed = JSON.stringify(recipe || {}) + '|' + (alias || '') + '|' + (name || '');
    const u = hashToUnit(seed);

    if (u > 0.97) return { label: 'Mythic', bonus: 35 };
    if (u > 0.90) return { label: 'Epic',   bonus: 20 };
    if (u > 0.70) return { label: 'Rare',   bonus: 10 };
    return { label: 'Common', bonus: 0 };
  }

  function computeQbitRating(qbit) {
    const boostInfo = mapBoostToSpecialty(qbit.boost);
    const parts = qbit.parts || (qbit.emblem && qbit.emblem.parts) || [];
    const fixes = qbit.fixes || (qbit.emblem && qbit.emblem.fixes) || [];

    const stability = calculateStability(parts, fixes, qbit.boost);
    const rarity    = calculateRarity(qbit.recipe, qbit.alias, qbit.name);

    const networkScore = Math.round(stability + boostInfo.basePower + rarity.bonus);

    return {
      specialtyKey:  boostInfo.key,
      specialtyLabel: boostInfo.label,
      stability,
      rarityLabel: rarity.label,
      networkScore
    };
  }

  function attachQbitRating(qbit) {
    if (!qbit) return qbit;
    qbit.rating = computeQbitRating(qbit);
    return qbit;
  }

  window.QbitRating = {
    attachQbitRating,
    computeQbitRating
  };
})(window);
