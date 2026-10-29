'use strict';
// Shared Machine-reply post-processing (hackathon step 15).
//
// stripEmDash(): the Machine never emits em dashes in player-visible
// replies (Resonance guide or Forge). An em dash becomes a comma; a comma
// left dangling before a period is folded away. Pure, no I/O.
function stripEmDash(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\s*—\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^,\s*/, '');
}

module.exports = { stripEmDash };
