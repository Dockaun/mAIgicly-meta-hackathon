// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
// qbit-descriptor.js
// Parses kid-written Qbit descriptions into structured animator parameters
// Compatible with Forge canvas preview

export function parseQbitDescription(text) {
  const t = (text || '').toLowerCase().split(/\s+/);

  // Helper to pick the first matching keyword or fallback
  const pick = (options, def) => options.find(opt => t.includes(opt)) || def;

  // Map keywords to animator parameters
  const shape = pick(['wave','twin','weave','spiral','veil'], 'wave');
  const motion = pick(['pulse','orbit','drift','spiral','hide'], 'pulse');
  const color = pick(
    ['indigo','teal','gold','ice','steel','violet','blue','green','magenta'], 
    'indigo'
  );
  const stripeThickness = pick(['thin','medium','thick'], 'medium');
  const stripeSpeed = t.includes('fast') ? 1.2 : t.includes('slow') ? 0.6 : 0.9;
  const amplitude = t.includes('lively') ? 20 : 12;
  const symmetry = (() => {
    const sym = pick(['low','medium','high'], 'high');
    return sym==='low'?1 : sym==='medium'?2 : 4;
  })();
  const extras = pick(['halo','veil','twin','none'], 'none');
  const mood = t.includes('lively') ? 0.9 : 0.4;
  const seed = Math.floor(Math.random() * 1e6);

  return { shape, motion, color, stripeThickness, stripeSpeed, amplitude, symmetry, extras, mood, seed };
}

// Optional helper: map color names to hex codes for canvas
export function colorHex(name) {
  const map = {
    indigo:'#6366f1',
    teal:'#14b8a6',
    gold:'#f59e0b',
    ice:'#67e8f9',
    steel:'#94a3b8',
    violet:'#a78bfa',
    blue:'#60a5fa',
    green:'#22c55e',
    magenta:'#e879f9'
  };
  return map[name.toLowerCase()] || '#7dd3fc';
}

// Advanced descriptor for more detailed rendering
export function parseDetailedDescription(text) {
  const desc = (text || '').toLowerCase();
  
  // Extract visual elements
  const hasThreads = desc.includes('thread') || desc.includes('threads');
  const hasNetwork = desc.includes('network') || desc.includes('lattice');
  const hasParticles = desc.includes('particle') || desc.includes('particles');
  const hasWaves = desc.includes('wave') || desc.includes('waves');
  const hasSpiral = desc.includes('spiral') || desc.includes('vortex');
  
  // Extract properties
  const isGentle = desc.includes('gentle') || desc.includes('calm') || desc.includes('smooth');
  const isThin = desc.includes('thin');
  const hasGlow = desc.includes('glow') || desc.includes('glowing');
  const isFlowing = desc.includes('flow') || desc.includes('flowing');
  const hasMerge = desc.includes('merge') || desc.includes('merging');
  const hasCoherence = desc.includes('coherence') || desc.includes('alignment');
  
  // Extract colors (multiple colors supported)
  const colors = extractColorsFromText(desc);
  
  return {
    visualType: hasThreads && hasNetwork ? 'threadNetwork' :
                hasThreads ? 'threads' :
                hasParticles ? 'particles' :
                hasWaves ? 'waves' :
                hasSpiral ? 'spiral' : 'adaptive',
    properties: {
      gentle: isGentle,
      thin: isThin,
      glow: hasGlow,
      flowing: isFlowing,
      merge: hasMerge,
      coherence: hasCoherence
    },
    colors: colors,
    rawText: text
  };
}

function extractColorsFromText(description) {
  const colorMap = {
    'teal': '#14b8a6', 'steel': '#94a3b8', 'indigo': '#6366f1', 
    'gold': '#f59e0b', 'ice': '#67e8f9', 'violet': '#a78bfa',
    'blue': '#60a5fa', 'green': '#22c55e', 'magenta': '#e879f9',
    'red': '#ef4444', 'orange': '#f97316', 'cyan': '#06b6d4',
    'purple': '#8b5cf6', 'pink': '#ec4899', 'emerald': '#10b981'
  };
  
  const foundColors = [];
  for (const [name, hex] of Object.entries(colorMap)) {
    if (description.includes(name)) {
      foundColors.push(hex);
    }
  }
  return foundColors.length > 0 ? foundColors : ['#14b8a6', '#94a3b8']; // Default teal and steel
}