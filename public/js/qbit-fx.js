// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
// QbitFX – tiny canvas compositor for Maigicly (no React, zero HTML changes)
(function(){
  function initQbitFX() {
    const C = document.getElementById('qbitCanvas');
    if (!C) { 
      console.warn('[QbitFX] qbitCanvas not found');
      return;
    }
    console.log('[QbitFX] Canvas found, initializing...');
    const ctx = C.getContext('2d', { willReadFrequently: false });

  // hidden <video> managed by QbitFX
  const base = document.createElement('video');
  base.muted = true;
  base.loop = true;
  base.preload = 'auto';
  base.crossOrigin = 'anonymous';
  // iOS requires these as attributes, not just properties
  base.setAttribute('playsinline', '');
  base.setAttribute('muted', '');
  base.setAttribute('autoplay', '');
  base.style.display = 'none';
  document.body.appendChild(base);

  const W = C.width, H = C.height;

  // Offscreen buffers
  const baseBuf = document.createElement('canvas'); baseBuf.width = W; baseBuf.height = H;
  const bctx = baseBuf.getContext('2d');

  const bloomBuf = document.createElement('canvas'); bloomBuf.width = W; bloomBuf.height = H;
  const blx = bloomBuf.getContext('2d');

  let rafId = 0, started = false;

  // ---------------- Load saved overlays from localStorage
  function loadOverlayConfig() {
    const missionId = (window.CONFIG && window.CONFIG.missionId) || 'default';
    const savedConfig = localStorage.getItem(`overlay.${missionId}`);
    if (savedConfig) {
      try {
        return JSON.parse(savedConfig);
      } catch (e) {
        console.warn('[QbitFX] Failed to parse saved overlay config:', e);
      }
    }
    return null;
  }

  // ---------------- Save overlay config to localStorage
  function saveOverlayConfig() {
    const missionId = (window.CONFIG && window.CONFIG.missionId) || 'default';
    const config = {
      sliders: { ...sliders },
      fun: { ...fun }
    };
    localStorage.setItem(`overlay.${missionId}`, JSON.stringify(config));
    console.log('[QbitFX] Saved overlay config for', missionId);
  }

  // ---------------- Sliders (defaults; you can override via QbitFX.setSliders)
  // Start with neutral values so video is undistorted initially
  const sliders = { phase:0.0, stability:0.6, glow:0.35, hue:0, angle:30, read:0.6 };
  
  // Load saved slider values if available
  const savedConfig = loadOverlayConfig();
  if (savedConfig && savedConfig.sliders) {
    Object.assign(sliders, savedConfig.sliders);
    console.log('[QbitFX] Loaded saved sliders:', sliders);
  }
  
  // ---------------- Fun effects toggles
  let fun = (savedConfig && savedConfig.fun) ? savedConfig.fun : (window.QBIT_FUN || {});
  console.log('[QbitFX] Loaded fun toggles:', fun);
  
  // If you later add inputs with these IDs, they'll auto-wire and save on change
  const ID = k => 's' + k.charAt(0).toUpperCase() + k.slice(1);
  ['phase','stability','glow','hue','angle','read'].forEach(k=>{
    const el = document.getElementById(ID(k));
    if (el) {
      // Set initial value from loaded config
      el.value = sliders[k];
      // Save on input change
      el.addEventListener('input', ()=> { 
        sliders[k] = +el.value;
        saveOverlayConfig();
      });
    }
  });

  // ---------------- Helpers (procedural overlays)
  function drawSplitterOverlay(alpha=0.35, angleDeg=30){
    ctx.save(); ctx.globalCompositeOperation='screen'; ctx.globalAlpha=alpha;
    const a=angleDeg*Math.PI/180, w=W*1.4, h=H*0.22;
    ctx.translate(W/2,H/2); ctx.rotate(-a);
    const g=ctx.createLinearGradient(-w/2,0,w/2,0);
    g.addColorStop(0,'rgba(90,212,255,0)'); g.addColorStop(0.5,'rgba(90,212,255,0.7)'); g.addColorStop(1,'rgba(90,212,255,0)');
    ctx.fillStyle=g; ctx.fillRect(-w/2,-h/2,w,h);
    ctx.restore(); ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
  }
  function drawReadoutOverlay(alpha=0.6, thickness=2){
    ctx.save(); ctx.globalAlpha=alpha; ctx.fillStyle='rgba(200,240,255,0.95)';
    ctx.fillRect(0, Math.floor(H/2 - thickness/2), W, thickness);
    ctx.globalAlpha=alpha*0.6;
    for(let x=0;x<W;x+=24) ctx.fillRect(x, Math.floor(H/2-6), 1, 12);
    ctx.restore();
  }
  function phaseWarp(src, strength, tMs){
    const sliceH = 6;
    for (let y=0; y<H; y+=sliceH){
      const off = Math.sin((tMs*0.005)+y*0.1) * strength * 10;
      ctx.drawImage(src, 0, y, W, sliceH, off, y, W, sliceH);
    }
  }
  function sparkles(intensity){
    ctx.save(); ctx.globalCompositeOperation='screen';
    const n = Math.floor(15 + 45*intensity);
    const t = performance.now();
    for(let i=0;i<n;i++){
      const x=(i*73 + t*0.08)%W, y=(i*41 + t*0.06)%H;
      // Rainbow cycling colors
      const hue = (t*0.1 + i*25) % 360;
      ctx.globalAlpha=.25+((i%7)/10);
      ctx.fillStyle=`hsl(${hue}, 95%, 75%)`;
      const size = 2 + Math.sin(t*0.01 + i) * 1.5;
      ctx.fillRect(x-size/2,y-size/2,size,size);
    }
    ctx.restore(); ctx.globalAlpha=1;
  }
  function vignette(str=0.45){
    const t = performance.now();
    // Pulsing colorful vignette
    const pulse = Math.sin(t*0.004) * 0.2 + 0.8;
    const hue = (t*0.02) % 360;
    const g=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.3*pulse, W/2,H/2,Math.min(W,H)*0.8);
    g.addColorStop(0,'rgba(0,0,0,0)'); 
    g.addColorStop(0.7,`hsla(${hue}, 60%, 20%, ${str*0.3})`);
    g.addColorStop(1,`rgba(0,0,0,${str})`);
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  }
  function rings(alpha=0.18){
    ctx.save(); ctx.globalCompositeOperation='screen'; ctx.globalAlpha=alpha;
    const t = performance.now();
    const cx=W/2, cy=H/2, max=Math.hypot(W,H)/2;
    for(let r=24;r<max;r+=24){ 
      ctx.beginPath(); 
      // Pulsing rings with color shifts
      const pulse = Math.sin(t*0.005 + r*0.1) * 3;
      const hue = (t*0.05 + r*2) % 360;
      ctx.arc(cx,cy,r+pulse,0,Math.PI*2);
      ctx.strokeStyle=`hsla(${hue}, 80%, 70%, 0.4)`; 
      ctx.lineWidth=2; ctx.stroke(); 
    }
    ctx.restore();
  }
  function chromaEdge(px=1){
    // Enhanced RGB fringe with color cycling
    const snap = ctx.getImageData(0,0,W,H);
    const t = performance.now();
    
    ctx.globalCompositeOperation='screen';
    // Red channel - jiggling offset
    const redShift = px + Math.sin(t*0.01)*2;
    ctx.putImageData(snap, redShift,0);
    
    // Blue channel - opposite jiggling
    const blueShift = -px + Math.cos(t*0.01)*2;
    ctx.putImageData(snap, blueShift,0);
    
    ctx.globalCompositeOperation='source-over';
  }
  function echoTrail(str=0.12){
    const t = performance.now();
    ctx.save(); ctx.globalAlpha=str; 
    // Jiggling echo trails with subtle movement
    const jiggleX = Math.sin(t*0.015) * 3;
    const jiggleY = Math.cos(t*0.012) * 2;
    ctx.drawImage(C, 2+jiggleX, jiggleY); 
    ctx.drawImage(C, -2-jiggleX, -jiggleY); 
    ctx.restore();
  }
  
  function canvasShake(strength=1.0){
    const t = performance.now();
    const shakeX = Math.sin(t*0.02) * strength * 4;
    const shakeY = Math.cos(t*0.025) * strength * 3;
    // Apply shake by translating the entire canvas content
    const imageData = ctx.getImageData(0,0,W,H);
    ctx.clearRect(0,0,W,H);
    ctx.putImageData(imageData, shakeX, shakeY);
  }
  
  // Sound effects removed for this version
  
  // Color/Texture Overlays - change how the fork itself looks
  function goldenOverlay(intensity=0.8){
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = intensity;
    const t = performance.now();
    // Golden shimmer effect
    const shimmer = Math.sin(t*0.003) * 0.2 + 0.8;
    ctx.fillStyle = `rgba(255, 215, 0, ${shimmer})`;
    ctx.fillRect(0,0,W,H);
    ctx.restore();
  }
  
  function crystalOverlay(intensity=0.8){
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = intensity;
    const t = performance.now();
    // Crystal-like ice blue shimmer effect
    const shimmer = Math.sin(t*0.004) * 0.15 + 0.85;
    ctx.fillStyle = `rgba(0, 200, 255, ${shimmer})`;
    ctx.fillRect(0,0,W,H);
    ctx.restore();
  }
  
  function thermalOverlay(intensity=0.9){
    const t = performance.now();
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = intensity;
    // Heat signature cycling from red to orange to yellow
    const heat = (Math.sin(t*0.005) + 1) / 2; // 0-1
    const r = 255;
    const g = Math.floor(165 + heat * 90); // 165-255 (orange to yellow)
    const b = Math.floor(heat * 100);      // 0-100 (red to orange)
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.7)`;
    ctx.fillRect(0,0,W,H);
    ctx.restore();
  }
  
  function toxicOverlay(intensity=0.8){
    const t = performance.now();
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = intensity;
    // Toxic green pulsing effect
    const pulse = Math.sin(t*0.008) * 0.3 + 0.7;
    ctx.fillStyle = `rgba(50, 255, 50, ${pulse})`;
    ctx.fillRect(0,0,W,H);
    // Add eerie glow
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = pulse * 0.4;
    ctx.fillStyle = `rgba(0, 255, 0, 0.3)`;
    ctx.fillRect(0,0,W,H);
    ctx.restore();
  }

  // ---------------- Main draw loop
  function draw(t){
    // 0) Base → offscreen
    bctx.clearRect(0,0,W,H);
    if (base.readyState >= 2) {
      if (base.paused || base.ended) base.play().catch(()=>{});
      bctx.drawImage(base, 0,0,W,H);
    } else {
      // fallback if no video yet
      bctx.fillStyle = '#000'; bctx.fillRect(0,0,W,H);
    }

    // 1) Color grade (Hue) base → main
    ctx.clearRect(0,0,W,H);
    ctx.filter = `hue-rotate(${sliders.hue}deg) saturate(1.15) brightness(1.05)`;
    ctx.drawImage(baseBuf,0,0);
    ctx.filter = 'none';

    // 2) Phase warp (reads from offscreen)
    if (sliders.phase > 0) phaseWarp(baseBuf, sliders.phase, t);

    // 3) Effects unlocked by current selections
    const sel = (window.state && window.state.selected) ? window.state.selected : {parts:[], fixes:[], boosts:[]};
    const has = id => sel.parts?.includes(id) || sel.fixes?.includes(id) || sel.boosts?.includes(id);

    // Parts
    if (has('shimmer_splitter')) drawSplitterOverlay(0.35, sliders.angle);
    if (has('readout'))          drawReadoutOverlay(0.25 + 0.75*sliders.read, 1 + Math.round(sliders.read*3));

    // Fixes
    if (sel.fixes?.includes('C//') && sliders.stability>0){
      const c = 1 + 0.15*sliders.stability, s = 1 + 0.15*sliders.stability;
      ctx.filter = `contrast(${c}) saturate(${s})`; ctx.drawImage(C,0,0); ctx.filter='none';
    }
    if (sel.fixes?.includes('F::')) chromaEdge(1);
    if (sel.fixes?.includes('SH'))  echoTrail(0.06); // light interference vibe

    // Boosts
    if (sel.boosts?.includes('PH~') && sliders.glow>0){
      blx.clearRect(0,0,W,H);
      blx.filter = `blur(${4 + 8*sliders.glow}px) brightness(${1.15 + 0.2*sliders.glow})`;
      blx.drawImage(C,0,0);
      ctx.globalCompositeOperation='screen'; ctx.globalAlpha = sliders.glow*0.8;
      ctx.drawImage(bloomBuf,0,0); ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
      sparkles(sliders.glow);
    }
    if (sel.boosts?.includes('G0')) vignette(0.5);
    if (sel.boosts?.includes('EN≡')) echoTrail(0.12);

    // Visual effects toggles - enhanced for visibility
    const F = fun || (window.QBIT_FUN || {});
    if (F.chroma)   chromaEdge(3);         // Jiggling RGB color shift
    if (F.rings)    rings(0.4);           // Pulsing colorful rings
    if (F.echo)     echoTrail(0.25);      // Jiggling echo trails
    if (F.sparkles) sparkles(Math.max(0.6, sliders.glow)); // Rainbow sparkles
    if (F.vignette) vignette(0.8);        // Color-cycling vignette
    if (F.links)    canvasShake(0.8);     // Full canvas shake effect
    
    // Color/Texture Overlays - transform the fork's appearance
    if (F.golden)   goldenOverlay(0.8);   // Golden shimmer overlay
    if (F.crystal)  crystalOverlay(0.7);  // Crystal color overlay
    if (F.thermal)  thermalOverlay(0.9);  // Heat signature overlay
    if (F.toxic)    toxicOverlay(0.8);    // Toxic green overlay

    // Mission always-on touch
    const mid = (window.CONFIG && window.CONFIG.missionId) || 'harmonic_tuning';
    if (mid === 'harmonic_tuning' && !F.rings) rings(0.18); // only if rings toggle isn't on

    rafId = requestAnimationFrame(draw);
  }

  function start(){
    if (started) return;
    started = true;
    console.log('[QbitFX] start() called, readyState:', base.readyState);
    
    // If video already buffered, kick; else wait for events
    if (base.readyState >= 2) { 
      console.log('[QbitFX] Video ready, attempting play');
      base.play().then(() => {
        console.log('[QbitFX] Play successful');
        rafId = requestAnimationFrame(draw);
      }).catch(e => console.warn('[QbitFX] Play failed:', e));
    }
    
    base.addEventListener('loadeddata', () => {
      console.log('[QbitFX] loadeddata event');
      base.play().catch(e => console.warn('[QbitFX] Play on loadeddata failed:', e));
    });
    
    base.addEventListener('play', () => { 
      console.log('[QbitFX] play event, starting draw loop');
      if (!rafId) rafId = requestAnimationFrame(draw); 
    });
    
    base.addEventListener('error', (e) => {
      console.error('[QbitFX] Video error event:', base.error);
    });
  }

  // ---------------- Public API
  window.QbitFX = {
    setBaseFromURL(url){
      try {
        console.log('[QbitFX] setBaseFromURL called with:', url);
        
        // Ensure video element is in DOM (should be from init, but verify)
        if (!document.body.contains(base)) {
          console.warn('[QbitFX] Video not in DOM, re-appending');
          document.body.appendChild(base);
        }
        
        // Guard: filenames with spaces must be URL-encoded or renamed
        const videoUrl = url.replace(/ /g, '%20');
        
        // Add error event listeners BEFORE setting src
        base.addEventListener('error', (e) => {
          console.error('[QbitFX] Video error:', base.error ? base.error.message : 'unknown', 'src:', base.src);
        }, { once: true });
        
        base.addEventListener('canplay', () => {
          console.log('[QbitFX] Video canplay event - video ready');
        }, { once: true });
        
        base.addEventListener('loadedmetadata', () => {
          console.log('[QbitFX] Video metadata loaded');
        }, { once: true });
        
        // Critical iOS fix: Set src and wait for next frame before loading
        base.src = videoUrl;
        console.log('[QbitFX] Video src set to:', base.src);
        
        // Use requestAnimationFrame to ensure DOM has processed src assignment
        requestAnimationFrame(() => {
          console.log('[QbitFX] Calling load() after RAF');
          base.load();
          
          // Wait for load to start before attempting play
          requestAnimationFrame(() => {
            base.play().then(() => {
              console.log('[QbitFX] Video playing successfully');
            }).catch(err => {
              console.log('[QbitFX] Autoplay prevented (will play on user interaction):', err.message);
            });
          });
        });
        
        start();
      } catch (e) {
        console.error('[QbitFX] setBaseFromURL error', e);
      }
    },
    setSliders(next){ 
      Object.assign(sliders, next||{}); 
      saveOverlayConfig();
    },
    getSliders(){ return { ...sliders }; },
    setFun(next){ 
      fun = next || {}; 
      saveOverlayConfig();
    },
    getFun(){ return { ...fun }; },
    save: saveOverlayConfig,
    start, 
    stop(){ if (rafId){ cancelAnimationFrame(rafId); rafId=0; } started=false; }
  };

  // If you want a default clip, you can call QbitFX.setBaseFromURL from your page.
  console.log('[QbitFX] ready');
  }
  
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQbitFX);
  } else {
    // DOM is already loaded
    initQbitFX();
  }
})();
