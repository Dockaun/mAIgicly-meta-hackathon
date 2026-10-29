// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
// qbit-recipe-mapper.js
// Maps forge selections (parts, fixes, boost) to qbit-library visual parameters

const MISSION_STYLES = {
  harmonic_tuning: {
    baseShape: 'wave',
    baseColors: ['indigo', 'cyan'],
    baseMotion: 'pulse',
    baseMood: 'calm'
  },
  entanglement: {
    baseShape: 'twin',
    baseColors: ['magenta', 'violet'],
    baseMotion: 'orbit',
    baseMood: 'lively'
  },
  coherence_stitching: {
    baseShape: 'lattice',
    baseColors: ['teal', 'steel'],
    baseMotion: 'shimmer',
    baseMood: 'focused'
  },
  energy_absorption: {
    baseShape: 'vortex',
    baseColors: ['gold', 'orange'],
    baseMotion: 'spiral',
    baseMood: 'energetic'
  },
  stealth_masking: {
    baseShape: 'veil',
    baseColors: ['steel', 'ice'],
    baseMotion: 'fade',
    baseMood: 'mysterious'
  }
};

const PART_MODIFIERS = {
  delay_gate: { extras: ['halo'], speed: 'slow' },
  light_catcher: { extras: ['glow', 'sparkle'], colors: ['gold'] },
  choice_buffer: { symmetry: 'bilateral' },
  mirror: { extras: ['twin'], symmetry: 'bilateral' },
  sync_node: { extras: ['particles'], motion: 'pulse' },
  tunnel: { shape: 'spiral', extras: ['trail'] },
  link_thread: { shape: 'ribbon', extras: ['ribbon'] },
  spin_cage: { motion: 'rotate', extras: ['halo'] },
  wave_merge: { shape: 'wave', motion: 'interference' },
  phase_anchor: { extras: ['glow'], thickness: 'thick' },
  coherence_web: { shape: 'mesh', extras: ['beam'] },
  absorber: { colors: ['orange', 'red'], motion: 'contract' },
  dampener: { motion: 'fade', mood: 'calm' },
  thermal_sink: { colors: ['cyan', 'ice'], extras: ['veil'] },
  shadow_weave: { colors: ['steel', 'black'], extras: ['veil'] },
  cloak_field: { motion: 'shimmer', extras: ['fade'] },
  null_zone: { colors: ['black', 'steel'], motion: 'fade' }
};

const FIX_MODIFIERS = {
  'SH': { thickness: 'thin', extras: ['shimmer'] },
  'F::': { motion: 'drift', extras: ['trail'] },
  'C//': { symmetry: 'high', extras: ['halo'] }
};

const BOOST_MODIFIERS = {
  'PH~': { motion: 'pulse', speed: 'fast', extras: ['gradient pulse'] },
  'EN≡': { thickness: 'extra-thick', extras: ['glow'] },
  'N0': { motion: 'vibrate', extras: ['sparkle'] },
  'G0': { motion: 'expand', symmetry: 'radial' }
};

function buildRecipeFromForge(missionId, parts = [], fixes = [], boost = null, fxSliders = null, funToggles = null) {
  const missionStyle = MISSION_STYLES[missionId] || MISSION_STYLES.harmonic_tuning;
  
  const recipe = {
    shape: missionStyle.baseShape,
    colors: [...missionStyle.baseColors],
    motion: missionStyle.baseMotion,
    thickness: 'medium',
    speed: 'medium',
    symmetry: 'medium',
    mood: missionStyle.baseMood,
    extras: []
  };
  
  parts.forEach(part => {
    const mod = PART_MODIFIERS[part];
    if (mod) {
      if (mod.shape) recipe.shape = mod.shape;
      if (mod.colors) recipe.colors = [...new Set([...recipe.colors, ...mod.colors])].slice(0, 2);
      if (mod.motion) recipe.motion = mod.motion;
      if (mod.thickness) recipe.thickness = mod.thickness;
      if (mod.speed) recipe.speed = mod.speed;
      if (mod.symmetry) recipe.symmetry = mod.symmetry;
      if (mod.mood) recipe.mood = mod.mood;
      if (mod.extras) recipe.extras = [...new Set([...recipe.extras, ...mod.extras])];
    }
  });
  
  fixes.forEach(fix => {
    const mod = FIX_MODIFIERS[fix];
    if (mod) {
      if (mod.motion) recipe.motion = mod.motion;
      if (mod.thickness) recipe.thickness = mod.thickness;
      if (mod.symmetry) recipe.symmetry = mod.symmetry;
      if (mod.extras) recipe.extras = [...new Set([...recipe.extras, ...mod.extras])];
    }
  });
  
  if (boost && BOOST_MODIFIERS[boost]) {
    const mod = BOOST_MODIFIERS[boost];
    if (mod.motion) recipe.motion = mod.motion;
    if (mod.speed) recipe.speed = mod.speed;
    if (mod.thickness) recipe.thickness = mod.thickness;
    if (mod.symmetry) recipe.symmetry = mod.symmetry;
    if (mod.extras) recipe.extras = [...new Set([...recipe.extras, ...mod.extras])];
  }
  
  recipe.extras = recipe.extras.slice(0, 3);
  
  if (fxSliders) {
    recipe.fxSliders = fxSliders;
  }
  if (funToggles) {
    recipe.funToggles = funToggles;
  }
  
  recipe.missionId = missionId;
  recipe.timestamp = Date.now();
  
  return recipe;
}

function buildLookFromRecipe(recipe) {
  return {
    shape: recipe.shape || 'wave',
    colors: recipe.colors || ['indigo'],
    motion: recipe.motion || 'pulse',
    thickness: recipe.thickness || 'medium',
    speed: recipe.speed || 'medium',
    symmetry: recipe.symmetry || 'medium',
    mood: recipe.mood || 'calm',
    extras: recipe.extras || []
  };
}

function buildEmblemFromBuild(missionId, parts, fixes, boost, score = 0) {
  return {
    mission: missionId,
    parts: parts || [],
    fixes: fixes || [],
    boost: boost || null,
    score: score,
    effects: []
  };
}

function createQbitCanvas(qbitData, size = { width: 200, height: 150 }) {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.borderRadius = '8px';
  canvas.style.background = '#020205';
  
  const ctx = canvas.getContext('2d');
  
  let params = qbitData.recipe;
  if (!params && qbitData.story && window.parseQbitDescription) {
    params = window.parseQbitDescription(qbitData.story);
  }
  if (!params && qbitData.mission_id) {
    params = buildRecipeFromForge(
      qbitData.mission_id,
      qbitData.parts || [],
      qbitData.fixes || [],
      qbitData.boost
    );
  }
  
  if (params && window.qbitLibrary && window.qbitLibrary.renderFrame) {
    try {
      window.qbitLibrary.renderFrame(ctx, size.width, size.height, params, 0);
    } catch (e) {
      console.warn('Initial render failed:', e);
      renderFallback(ctx, size.width, size.height, params);
    }
    
    let animationId = null;
    
    canvas.addEventListener('mouseenter', () => {
      canvas.dataset.animating = 'true';
      const animate = () => {
        if (canvas.dataset.animating !== 'true') return;
        try {
          window.qbitLibrary.renderFrame(ctx, size.width, size.height, params, Date.now());
        } catch (e) {}
        animationId = requestAnimationFrame(animate);
      };
      animate();
    });
    
    canvas.addEventListener('mouseleave', () => {
      canvas.dataset.animating = 'false';
      if (animationId) cancelAnimationFrame(animationId);
    });
  } else {
    renderFallback(ctx, size.width, size.height, params);
  }
  
  return canvas;
}

function renderFallback(ctx, width, height, params) {
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(0, 0, width, height);
  
  const colors = params && params.colors ? params.colors : ['indigo', 'cyan'];
  const colorMap = {
    'indigo': '#6366f1', 'violet': '#a78bfa', 'teal': '#14b8a6', 'magenta': '#e879f9',
    'blue': '#60a5fa', 'cyan': '#06b6d4', 'green': '#22c55e', 'lime': '#84cc16',
    'gold': '#f59e0b', 'amber': '#f59e0b', 'orange': '#f97316', 'red': '#ef4444',
    'pink': '#ec4899', 'ice': '#67e8f9', 'steel': '#94a3b8', 'white': '#ffffff'
  };
  
  const primaryColor = colorMap[colors[0]] || '#7dd3fc';
  const secondaryColor = colors[1] ? (colorMap[colors[1]] || primaryColor) : primaryColor;
  
  const gradient = ctx.createRadialGradient(width/2, height/2, 10, width/2, height/2, Math.min(width, height)/2);
  gradient.addColorStop(0, primaryColor + '40');
  gradient.addColorStop(0.5, secondaryColor + '20');
  gradient.addColorStop(1, 'transparent');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  ctx.beginPath();
  ctx.arc(width/2, height/2, 20, 0, Math.PI * 2);
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  
  ctx.beginPath();
  ctx.arc(width/2, height/2, 35, 0, Math.PI * 2);
  ctx.strokeStyle = secondaryColor + '80';
  ctx.lineWidth = 1;
  ctx.stroke();
}

window.QbitRecipeMapper = {
  buildRecipeFromForge,
  buildLookFromRecipe,
  buildEmblemFromBuild,
  createQbitCanvas,
  renderFallback,
  MISSION_STYLES,
  PART_MODIFIERS,
  FIX_MODIFIERS,
  BOOST_MODIFIERS
};
