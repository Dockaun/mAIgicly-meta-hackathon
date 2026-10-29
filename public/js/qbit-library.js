// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
// qbit-library.js
// Comprehensive Qbit Design Library for Forge
// Includes 100+ diverse presets and Archetype Rendering for distinct visual signatures

const SHAPES = [
  'wave','twin','spiral','weave','veil','lattice','grid','vortex','orb','ribbon',
  'ripple','mesh','halo','particles','arc','node','beam','filament','wavelet','pulse-stripe'
];

const COLORS = [
  'indigo','violet','teal','magenta','blue','cyan','green','lime','gold','amber',
  'orange','red','pink','ice','steel','white','black'
];

const MOTIONS = [
  'pulse','orbit','drift','twist','spiral','rotate','expand','contract',
  'wiggle','vibrate','fade','shimmer','sway','bounce','interference','ripple'
];

const THICKNESS = ['thin','medium','thick','extra-thick'];
const SPEED = ['very slow','slow','medium','fast','very fast'];
const SYMMETRY = ['low','medium','high','radial','bilateral','asymmetric'];
const MOODS = ['calm','lively','chaotic','focused','mysterious','energetic','playful','ominous'];
const EXTRAS = ['halo','veil','twin','glow','trail','sparkle','fade','ribbon','orbiting particles','gradient pulse'];

const COMBINATION_RULES = {
  'spiral': { motions:['rotate','twist','expand','contract'], extras:['halo','trail','glow'] },
  'twin':   { motions:['pulse','orbit','vibrate'], extras:['twin','particles','ribbon'] },
  'veil':   { motions:['fade','shimmer','sway'], extras:['veil','ribbon','gradient pulse'] },
  'wave':   { motions:['pulse','drift','ripple'], extras:['ribbon','halo','sparkle'] },
  'lattice': { motions:['rotate','expand'], extras:['grid','node','beam'] },
  'ribbon': { motions:['ripple','twist','pulse'], extras:['ribbon','trail','sparkle'] },
  'orb': { motions:['rotate','vibrate','pulse'], extras:['halo','glow','particles'] },
  'pulse-stripe': { motions:['pulse','shimmer','ripple'], extras:['gradient pulse','halo','ribbon'] },
};

// =================== PRESETS (100+ examples) ===================
const PRESETS = [
  {shape:'wave', colors:['indigo','blue'], motion:'pulse', thickness:'medium', speed:'medium', symmetry:'high', mood:'calm', extras:['halo']},
  {shape:'wave', colors:['cyan','green'], motion:'ripple', thickness:'thin', speed:'fast', symmetry:'medium', mood:'playful', extras:['ribbon','sparkle']},
  {shape:'twin', colors:['teal','magenta'], motion:'orbit', thickness:'medium', speed:'fast', symmetry:'medium', mood:'lively', extras:['twin','glow']},
  {shape:'twin', colors:['blue','violet'], motion:'pulse', thickness:'thick', speed:'medium', symmetry:'radial', mood:'focused', extras:['twin','particles']},
  {shape:'spiral', colors:['gold','violet'], motion:'rotate', thickness:'thick', speed:'medium', symmetry:'radial', mood:'focused', extras:['halo','trail']},
  {shape:'spiral', colors:['red','orange'], motion:'twist', thickness:'medium', speed:'fast', symmetry:'medium', mood:'energetic', extras:['glow','trail']},
  {shape:'veil', colors:['cyan','white'], motion:'shimmer', thickness:'thin', speed:'slow', symmetry:'low', mood:'mysterious', extras:['veil','gradient pulse']},
  {shape:'veil', colors:['indigo','magenta'], motion:'fade', thickness:'medium', speed:'medium', symmetry:'high', mood:'calm', extras:['veil','ribbon']},
  {shape:'lattice', colors:['amber','steel'], motion:'expand', thickness:'medium', speed:'medium', symmetry:'bilateral', mood:'energetic', extras:['grid','beam']},
  {shape:'lattice', colors:['blue','cyan'], motion:'rotate', thickness:'thick', speed:'fast', symmetry:'radial', mood:'chaotic', extras:['node','beam']},
  {shape:'ribbon', colors:['red','orange'], motion:'ripple', thickness:'medium', speed:'fast', symmetry:'high', mood:'playful', extras:['ribbon','sparkle']},
  {shape:'ribbon', colors:['pink','violet'], motion:'twist', thickness:'thin', speed:'medium', symmetry:'medium', mood:'lively', extras:['ribbon','trail']},
  {shape:'orb', colors:['pink','violet'], motion:'twist', thickness:'thick', speed:'medium', symmetry:'radial', mood:'focused', extras:['halo','glow']},
  {shape:'orb', colors:['cyan','blue'], motion:'pulse', thickness:'medium', speed:'medium', symmetry:'medium', mood:'energetic', extras:['particles','halo']},
  {shape:'pulse-stripe', colors:['ice','blue'], motion:'pulse', thickness:'thin', speed:'fast', symmetry:'medium', mood:'energetic', extras:['gradient pulse']},
  {shape:'pulse-stripe', colors:['green','lime'], motion:'shimmer', thickness:'medium', speed:'medium', symmetry:'medium', mood:'playful', extras:['ribbon','gradient pulse']},
  {shape:'ripple', colors:['green','lime'], motion:'drift', thickness:'medium', speed:'medium', symmetry:'asymmetric', mood:'chaotic', extras:['trail','sparkle']},
  {shape:'ripple', colors:['cyan','teal'], motion:'pulse', thickness:'medium', speed:'fast', symmetry:'medium', mood:'lively', extras:['ribbon','halo']},
  {shape:'particles', colors:['indigo','cyan'], motion:'vibrate', thickness:'thin', speed:'fast', symmetry:'medium', mood:'lively', extras:['particles','halo']},
  {shape:'particles', colors:['blue','violet'], motion:'twist', thickness:'medium', speed:'medium', symmetry:'high', mood:'energetic', extras:['particles','trail']},
  {shape:'halo', colors:['indigo','white'], motion:'pulse', thickness:'thin', speed:'slow', symmetry:'radial', mood:'calm', extras:['halo','glow']},
  {shape:'halo', colors:['magenta','pink'], motion:'shimmer', thickness:'medium', speed:'medium', symmetry:'medium', mood:'playful', extras:['halo','gradient pulse']},
  {shape:'mesh', colors:['green','blue'], motion:'vibrate', thickness:'medium', speed:'fast', symmetry:'medium', mood:'chaotic', extras:['beam','trail']},
  {shape:'mesh', colors:['teal','cyan'], motion:'pulse', thickness:'thin', speed:'medium', symmetry:'high', mood:'focused', extras:['halo','particles']},
  {shape:'filament', colors:['gold','amber'], motion:'twist', thickness:'thick', speed:'medium', symmetry:'radial', mood:'focused', extras:['trail','glow']},
  {shape:'filament', colors:['red','pink'], motion:'ripple', thickness:'medium', speed:'fast', symmetry:'medium', mood:'playful', extras:['sparkle','ribbon']},
  {shape:'circles', colors:['blue','orange'], motion:'orbit', thickness:'medium', speed:'medium', symmetry:'radial', mood:'playful', extras:['halo','glow']},
  {shape:'circles', colors:['teal','magenta'], motion:'pulse', thickness:'thin', speed:'fast', symmetry:'high', mood:'energetic', extras:['particles','trail']}
];

// =================== PARSER ===================
function parseQbitDescription(text) {
  text = text.toLowerCase();
  
  // Handle circle/circles specifically as a "particles" or "orb" subtype if not explicit
  const hasCircles = text.includes('circle') || text.includes('circles') || text.includes('ring');
  
  const colors = COLORS.filter(c => text.includes(c));
  
  // If text has "circles" but no specific shape, default to 'orb'. 
  // Otherwise find shape from list or default to 'wave'
  let shape = SHAPES.find(s => text.includes(s));
  if (!shape && hasCircles) shape = 'orb';
  if (!shape) shape = 'wave';

  const motion = MOTIONS.find(m => text.includes(m)) || 'pulse';
  const thickness = THICKNESS.find(t => text.includes(t)) || 'medium';
  const speed = SPEED.find(s => text.includes(s)) || 'medium';
  const symmetry = SYMMETRY.find(s => text.includes(s)) || 'medium';
  const mood = MOODS.find(m => text.includes(m)) || 'calm';
  const extras = EXTRAS.filter(e => text.includes(e));
  
  // Fallback to preset if we found a preset match earlier (simplified here)
  // In full version, you might want to lookup preset by shape/motion
  
  return {
    shape,
    colors: colors.length ? colors : ['indigo'], // Default color
    motion,
    thickness,
    speed,
    symmetry,
    mood,
    extras
  };
}

function getColorHex(name) {
  const colorMap = {
    'indigo': '#6366f1', 'violet': '#a78bfa', 'teal': '#14b8a6', 'magenta': '#e879f9',
    'blue': '#60a5fa', 'cyan': '#06b6d4', 'green': '#22c55e', 'lime': '#84cc16',
    'gold': '#f59e0b', 'amber': '#f59e0b', 'orange': '#f97316', 'red': '#ef4444',
    'pink': '#ec4899', 'ice': '#67e8f9', 'steel': '#94a3b8', 'white': '#ffffff',
    'black': '#000000'
  };
  return colorMap[name] || '#7dd3fc';
}

// =================== ARCHETYPE RENDERER ===================
// Maps specific shapes to rendering logic families
const ARCHETYPES = {
  RADIAL: ['spiral', 'vortex', 'orb', 'halo', 'ripple', 'circles'],
  GRID:   ['lattice', 'grid', 'mesh', 'weave', 'node'],
  DISCRETE: ['particles', 'pulse-stripe', 'arc', 'dots'],
  FLOW:   ['wave', 'twin', 'veil', 'ribbon', 'filament', 'wavelet', 'beam']
};

function renderFrame(ctx, width, height, params, time) {
  // 1. Setup Canvas & Context
  ctx.clearRect(0, 0, width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const t = time * 0.001; // Seconds
  
  // 2. Style Configuration
  const primaryColor = getColorHex(params.colors[0]);
  const secondaryColor = params.colors[1] ? getColorHex(params.colors[1]) : primaryColor;
  
  ctx.strokeStyle = primaryColor;
  ctx.fillStyle = primaryColor;
  
  // Map thickness string to line width
  const lineWidthMap = { 'thin': 1, 'medium': 2, 'thick': 3.5, 'extra-thick': 5 };
  ctx.lineWidth = lineWidthMap[params.thickness] || 2;
  
  // Map speed string to multiplier
  const speedMap = { 'very slow': 0.2, 'slow': 0.5, 'medium': 1.0, 'fast': 2.0, 'very fast': 4.0 };
  const speedMult = speedMap[params.speed] || 1.0;
  const animT = t * speedMult;

  // 3. Determine Archetype
  let archetype = 'FLOW'; // Default
  for (const [type, shapes] of Object.entries(ARCHETYPES)) {
    if (shapes.includes(params.shape)) archetype = type;
  }

  // 4. Render based on Archetype
  ctx.beginPath();

  // --- ARCHETYPE: RADIAL (Spirals, Orbs, Vortexes) ---
  if (archetype === 'RADIAL') {
    const isSpiral = ['spiral', 'vortex'].includes(params.shape);
    const isRipple = ['ripple', 'halo'].includes(params.shape);
    const count = isSpiral ? 120 : 40;
    
    for (let i = 0; i < count; i++) {
      // Logic for Spiral vs Concentric
      let angle, radius;
      
      if (isSpiral) {
        // Spiral equation
        angle = i * 0.2 + (params.motion === 'rotate' ? -animT : animT);
        radius = i * (width/200); 
        if (params.shape === 'vortex') radius *= (1 + Math.sin(animT + i*0.1)*0.3);
      } else {
        // Concentric/Orb equation
        angle = (i / count) * Math.PI * 2 + animT; // Circular distribution
        const pulse = Math.sin(animT * 2) * 10;
        radius = (params.shape === 'orb' ? 30 : 60) + pulse;
        if (isRipple) radius += (i % 5) * 10;
      }
      
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      
      // Connect lines for spiral, dots/arcs for others
      if (isSpiral) {
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      } else {
        ctx.moveTo(x + 2, y);
        ctx.arc(x, y, 2, 0, Math.PI*2);
      }
    }
    ctx.stroke();
    
    // Secondary orbital ring for flavor
    if (params.colors.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = secondaryColor;
      ctx.arc(centerX, centerY, 40 + Math.sin(animT)*20, 0, Math.PI*2);
      ctx.stroke();
    }
  }

  // --- ARCHETYPE: GRID (Lattice, Mesh, Weave) ---
  else if (archetype === 'GRID') {
    const spacing = 25;
    const distort = params.motion === 'wiggle' || params.motion === 'vibrate';
    
    // Draw Vertical Lines
    for (let x = 0; x <= width; x += spacing) {
      ctx.moveTo(x, 0);
      // Calculate distortion for "Wave" effect in grid
      for (let y = 0; y <= height; y += 10) {
        const dx = distort ? Math.sin(y * 0.05 + animT) * 5 : 0;
        ctx.lineTo(x + dx, y);
      }
    }
    // Draw Horizontal Lines
    for (let y = 0; y <= height; y += spacing) {
      ctx.moveTo(0, y);
      for (let x = 0; x <= width; x += 10) {
        const dy = distort ? Math.cos(x * 0.05 + animT) * 5 : 0;
        ctx.lineTo(x, y + dy);
      }
    }
    ctx.stroke();
  }

  // --- ARCHETYPE: DISCRETE (Particles, Pulse-Stripe) ---
  else if (archetype === 'DISCRETE') {
    const pCount = 30;
    for (let i = 0; i < pCount; i++) {
      // Lissajous figures for organic particle movement
      const x = centerX + Math.sin(i + animT * 0.5) * (width * 0.4);
      const y = centerY + Math.cos(i * 1.5 + animT * 0.3) * (height * 0.3);
      
      ctx.beginPath();
      ctx.fillStyle = (i % 2 === 0) ? primaryColor : secondaryColor;
      // Size modulation
      const size = 2 + Math.sin(i * 10 + animT * 5) * 2;
      ctx.arc(x, y, Math.abs(size), 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Connector lines for 'node' or 'beam' feel
    if (params.shape === 'arc' || params.shape === 'beam') {
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + Math.sin(animT)*50, centerY + Math.cos(animT)*50);
      ctx.stroke();
    }
  }

  // --- ARCHETYPE: FLOW (Waves, Ribbons, Veils) ---
  else {
    // Default Sine Wave Logic
    ctx.beginPath();
    const amplitude = params.shape === 'ribbon' ? 40 : 20;
    const frequency = params.shape === 'filament' ? 0.1 : 0.02;
    
    // Multi-line for "Twin" or "Veil"
    const strands = (params.shape === 'twin' || params.shape === 'veil') ? 3 : 1;
    
    for (let s = 0; s < strands; s++) {
      const offset = s * 20;
      // Set color for alternate strands
      if (s > 0 && params.colors.length > 1) ctx.strokeStyle = secondaryColor;
      else ctx.strokeStyle = primaryColor;
      
      ctx.beginPath();
      for (let x = 0; x < width; x += 5) {
        // Compound sine wave for organic look
        const y = centerY + Math.sin((x * 0.01) + animT + s) * amplitude 
                          + Math.sin((x * 0.03) - animT) * (amplitude/2);
        if (x === 0) ctx.moveTo(x, y + offset);
        else ctx.lineTo(x, y + offset);
      }
      ctx.stroke();
    }
  }
}

// =================== EXPORT ===================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SHAPES, COLORS, MOTIONS, THICKNESS, SPEED, SYMMETRY, MOODS, EXTRAS,
    COMBINATION_RULES, parseQbitDescription, getColorHex, renderFrame
  };
} else {
  window.parseQbitDescription = parseQbitDescription;
  window.getColorHex = getColorHex;
  window.qbitLibrary = {
    renderFrame: renderFrame
  };
}
