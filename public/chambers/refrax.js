console.log("Refrax chamber loaded");

/* ================= Voice Settings ================= */
const VOICE_ON = false; // Voice feedback disabled by default

function computeCorridorId(chamber, voiceSelections) {
  if (!voiceSelections || voiceSelections.length === 0) return chamber + '_unknown';
  const how = voiceSelections.find(v => v.dimension === 'how');
  const like = voiceSelections.find(v => v.dimension === 'like');
  const dominant = how || like;
  return dominant ? chamber + '_' + dominant.label.toLowerCase().replace(/\s+/g, '_') : chamber + '_unknown';
}

/* ================= Story Content ================= */
const REFRAX_STORY = `I aligned the light until one stripe held, then gripped HOLD TO LOCK to collapse the wave into a single, sharp line. The room answered by rumbling loudly, its mirrors rippling into funhouse angles. Suddenly, I snapped ahead, pulled by a powerful, unseen force.  "What the—Refrax!" I yelled, only to hear the friendly click clack call back with a brief, reflective flash of mirrored Vans: "Hand-off! Hold onto those kicks!  And don't worry—whatever the next aspect says, I still won't gossip about those Neon Nuggets."`;

/* ================= Story Display Function ================= */
function showStoryContent(story, onCloseCallback) {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(5px);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
  `;

  // Create story container
  const container = document.createElement('div');
  container.style.cssText = `
    background: linear-gradient(180deg, #0d1426, rgba(13, 20, 38, 0.98));
    border: 2px solid #7dd3fc;
    border-radius: 16px;
    width: 100%;
    max-width: 800px;
    max-height: 85vh;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
    position: relative;
  `;

  // Create header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 20px 24px 16px;
    border-bottom: 1px solid #24304d;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: linear-gradient(180deg, rgba(125, 211, 252, 0.1), transparent);
  `;

  const title = document.createElement('h3');
  title.textContent = "Log Entry";
  title.style.cssText = `
    margin: 0;
    font-size: 24px;
    color: #7dd3fc;
    font-weight: 700;
  `;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.cssText = `
    background: transparent;
    border: 1px solid #24304d;
    color: #ffffff;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    transition: all 0.2s;
  `;

  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.borderColor = '#7dd3fc';
    closeBtn.style.background = 'rgba(125, 211, 252, 0.1)';
  });

  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.borderColor = '#24304d';
    closeBtn.style.background = 'transparent';
  });

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Create scrollable body
  const body = document.createElement('div');
  body.style.cssText = `
    padding: 24px;
    max-height: calc(85vh - 120px);
    overflow-y: auto;
    line-height: 1.7;
    font-size: 16px;
    color: #ffffff;
  `;

  // Apply scrollbar styling
  const style = document.createElement('style');
  style.textContent = `
    .story-body::-webkit-scrollbar {
      width: 8px;
    }
    .story-body::-webkit-scrollbar-track {
      background: #111a2a;
      border-radius: 4px;
    }
    .story-body::-webkit-scrollbar-thumb {
      background: #7dd3fc;
      border-radius: 4px;
    }
    .story-body::-webkit-scrollbar-thumb:hover {
      background: rgba(125, 211, 252, 0.8);
    }
  `;
  document.head.appendChild(style);
  body.className = 'story-body';

  // Format story content
  const paragraphs = story.split('\n\n');
  paragraphs.forEach(para => {
    if (para.trim()) {
      const p = document.createElement('p');
      p.style.cssText = 'margin: 0 0 16px 0; color: #ffffff;';
      
      // Handle binary code
      if (/^[01, ]+$/.test(para.trim())) {
        p.style.cssText += 'font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #7dd3fc; background: rgba(125, 211, 252, 0.1); padding: 4px 8px; border-radius: 4px; font-size: 14px; letter-spacing: 1px;';
      }
      
      // Handle character name highlighting
      // No character highlighting needed
      
      p.innerHTML = para;
      body.appendChild(p);
    }
  });

  // Assemble and show
  container.appendChild(header);
  container.appendChild(body);
  overlay.appendChild(container);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  // Close handlers
  const closeStory = () => {
    document.body.removeChild(overlay);
    document.body.style.overflow = '';
    if (style.parentNode) {
      document.head.removeChild(style);
    }
    if (onCloseCallback) onCloseCallback();
  };

  closeBtn.addEventListener('click', closeStory);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeStory();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeStory();
  }, { once: true });
}

/* ---------- Robust GIF resolver ---------- */
function pickFirstImage(el, paths){
  const tester = new Image(); let i = 0;
  function tryNext(){
    if (i >= paths.length) { console.warn("Refrax GIF not found:", paths); return; }
    const url = paths[i++];
    tester.onload  = () => { el.src = url; console.log("Refrax GIF loaded:", url); };
    tester.onerror = tryNext; tester.src = url;
  }
  tryNext();
}
document.addEventListener("DOMContentLoaded", () => {
  // GIF replaced with video — autoplay handles playback, no resolver needed
  
  // Track chamber visit
  if (window.MaigiclyAnalytics) {
    window.MaigiclyAnalytics.track({
      event_name: 'chamber_visit',
      qbit: 'refrax',
      chamber: 'refrax'
    });
  }
});

/* ================= Audio System (DISABLED - Silent Mode) ================= */
function speak(text, options = {}) {
  // Audio disabled - game runs silently
  return;
}

/* ================= Storage (v3) ================= */
const NS = "refrax.v3.";
const KEYS = {
  part: (i) => `${NS}part.${i}`, complete: `${NS}complete`,
  points: `${NS}points`, level:  `${NS}level`,
  hintIdx:(i) => `${NS}hint.${i}`, misses:(i) => `${NS}miss.${i}`,
  migrated: `${NS}migrated`
};
const LS = {
  get:(k,f=null)=>{ 
    const r=localStorage.getItem(k); 
    if(r==null) return f; 
    // Always return raw string for our boolean checks
    return r;
  },
  set:(k,v)=>localStorage.setItem(k, String(v)),
};
(function ensureV3(){
  if (LS.get(KEYS.migrated, "false") !== "true") {
    LS.set(KEYS.points, 0); LS.set(KEYS.level, 1);
    [1,2,3].forEach(i=>{ LS.set(KEYS.part(i), "false"); LS.set(KEYS.hintIdx(i), 0); LS.set(KEYS.misses(i), 0); });
    LS.set(KEYS.migrated, "true");
  }
  // Reset local chamber progress for replay, but preserve completion status
  const isAlreadyCompleted = LS.get("refrax.v3.complete") === "true";
  LS.set(KEYS.points, 0);
  LS.set(KEYS.level, 1);
  [1,2,3].forEach(i=>{ LS.set(KEYS.part(i), "false"); });
  // DON'T reset the completion flag - keep it if already completed
  if (!isAlreadyCompleted) {
    LS.set(KEYS.complete, "false");
  }
  console.log(isAlreadyCompleted ? 
    "🔄 Refrax chamber ready for replay (already completed)" : 
    "🔄 Refrax chamber ready for attempts");
})();
const Progress = {
  partDone:(i)=> {
    const result = LS.get(KEYS.part(i));
    const isDone = result === "true";
    console.log(`Checking part ${i}: stored = "${result}" (type: ${typeof result}), is done = ${isDone}`);
    return isDone;
  },
  setPart:(i)=> {
    console.log(`Setting part ${i} as completed`);
    LS.set(KEYS.part(i), "true");
    // Verify it was set
    const verify = LS.get(KEYS.part(i));
    console.log(`Verification: part ${i} stored as "${verify}"`);
  },
  isComplete:()=> {
    const complete = LS.get(KEYS.complete) === "true";
    const allParts = [1,2,3].every(i=>Progress.partDone(i));
    console.log(`Chamber complete check: explicit=${complete}, all parts=${allParts}`);
    return complete || allParts;
  },
  setComplete:()=>LS.set(KEYS.complete,"true"),
  points:()=> Number(LS.get(KEYS.points,0)) || 0,
  add:(n)=>LS.set(KEYS.points, Progress.points()+n),
  level:()=> Number(LS.get(KEYS.level,1)) || 1,
  setLevel:(L)=>LS.set(KEYS.level,L),
};
function recomputeLevel(p){ if(p>=6) return 3; if(p>=3) return 2; return 1; }
function award(n){ 
  Progress.add(n); 
  const L = recomputeLevel(Progress.points()); 
  if(L!==Progress.level()) Progress.setLevel(L); 
  paintStats();
  
  // Global points are handled by GlobalPoints.completePart() directly
  // This function only updates local UI progress
}
function paintStats(){ 
  const pEl = document.getElementById("points");
  const lEl = document.getElementById("level");
  if (pEl) pEl.textContent = Progress.points();
  if (lEl) lEl.textContent = Progress.level();
}

/* ================= Content: 3 shuffled parts ================= */
const ROWS_BASE = [
  { part:"Mirror", i:1, mod:"SH", mechanic:"superposition",
    why:"Split beams to compare light paths.",
    hints:["We need to check all the paths first.","Superposition = every option stays open to check.","Use SH to hold the choices open."],
    success:"Nice — paths stayed open. Now the chamber can check which one is strongest.",
    fail:"Closed too early—no pattern to guide us.", mini:"tap_confirm", params:{} },
  { part:"Laser", i:2, mod:"F::", mechanic:"interference",
    why:"Direct light along a chosen path.",
    hints:["Overlap makes one stripe brighter.","Small timing shifts bring it into the zone.","Use F:: to line it up."],
    success:"Yes—the stripe shone in the target zone. That shows the strongest choice so far.",
    fail:"Missed the zone—the chamber cannot tell which choice stands out.",
    mini:"nudge_to_zone", params:{ start:25, target:50, steps:10, tolerance:8 } },
  { part:"Sensor", i:3, mod:"C//", mechanic:"decoherence",
    why:"Detect the dominant light path.",
    hints:["We need one clear result.","Decoherence = one steady answer.","Use C// to lock it."],
    success:"Locked sharp—measurement made one clear result the chamber can use.",
    fail:"Still unclear—too many results at once.", mini:"hold_steady", params:{ seconds:4 } },
];
const ROWS = shuffle(ROWS_BASE.slice());

/* ================= Build UI (short tooltips on mods only) ================= */
const ALL_MODS = ["SH","F::","C//"];
const TOOLTIP = {
  "SH":  "SH — Superpose — Hold paths open",
  "F::": "F:: — FringeGate — Nudge waves into sync",
  "C//": "C// — Collapse — Secure the result"
};

let __lastDraggedMod = null;
const modsEl = document.getElementById("mods");
const shuffledMods = shuffle(ALL_MODS.slice());
shuffledMods.forEach(code=>{
  const el = document.createElement("div");
  el.className = "mod tip";
  el.draggable = true;
  el.dataset.mod = code;
  el.innerHTML = `<b>${code}</b>`;
  el.setAttribute("data-tip", TOOLTIP[code]);
  el.setAttribute("aria-label", TOOLTIP[code]);
  el.tabIndex = 0;

  el.addEventListener("dragstart", e => {
    e.stopPropagation();
    __lastDraggedMod = code;
    e.dataTransfer.setData("text/plain", code);
    e.dataTransfer.effectAllowed = "move";
    e.target.style.opacity = "0.5";
  });
  
  el.addEventListener("dragend", e => {
    e.target.style.opacity = "1";
  });
  el.addEventListener("touchstart", () => {
    el.classList.add("show-tip");
    setTimeout(()=> el.classList.remove("show-tip"), 1200);
  }, {passive:true});

  modsEl.appendChild(el);
});

const chamber = document.getElementById("chamber");
ROWS.forEach(row=>{
  const card = document.createElement("div");
  card.className = "part tip";  // Add tooltip class
  card.id = `part-${row.i}`;
  card.dataset.i = String(row.i);
  card.setAttribute("data-tip", row.why);
  card.setAttribute("aria-label", row.why);
  card.innerHTML = `<h3>${row.part}</h3><div class="desc muted" style="font-size:13px;min-height:20px;"></div>`;
  if (Progress.partDone(row.i)) {
    card.classList.add("done");
    const done = document.createElement("div");
    done.className = "muted";
    done.textContent = `✔ ${row.mod} fixed`;
    card.appendChild(done);
  }
  
  // Hover tooltips are visual only - no audio
  
  chamber.appendChild(card);
});

/* ================= Mobile Tap-to-Select ================= */
// Only enable on touch devices to preserve desktop tooltip interactions
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

if (isTouchDevice) {
  let selectedMod = null;

  // Tap to select a mod chip
  document.querySelectorAll('.mod').forEach(modEl => {
    modEl.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Deselect all mods
      document.querySelectorAll('.mod').forEach(m => {
        m.style.outline = 'none';
        m.style.transform = 'scale(1)';
      });
      
      // Select this mod
      selectedMod = modEl.dataset.mod;
      modEl.style.outline = '3px solid #34d399';
      modEl.style.transform = 'scale(1.05)';
    });
  });

  // Tap a part to place the selected mod
  document.querySelectorAll('.part').forEach(partEl => {
    partEl.addEventListener('click', async (e) => {
      if (!selectedMod) return;
      
      e.preventDefault();
      
      const i = Number(partEl.dataset.i);
      const row = ROWS.find(r => r.i === i);
      if (!row) return;
      
      const got = selectedMod;
      const need = row.mod;
      
      // Clear selection
      document.querySelectorAll('.mod').forEach(m => {
        m.style.outline = 'none';
        m.style.transform = 'scale(1)';
      });
      selectedMod = null;
      
      // Call drop handler
      await handleDrop(partEl, got, i, row, need);
    });
  });
}

/* ================= Hints & Miss counting ================= */
function nextHint(row){
  const key = KEYS.hintIdx(row.i);
  let n = Number(LS.get(key, 0)) || 0;
  const hint = row.hints[Math.min(n, row.hints.length - 1)];
  LS.set(key, n + 1);
  return hint;
}

/* ================= Shared Drop Handler ================= */
let __refraxCompletedOnce = false;

async function handleDrop(holder, got, i, row, need) {

  if (got !== need) {
    const hint = nextHint(row);
    const descEl = holder.querySelector(".desc");
    if (descEl) {
      descEl.textContent = hint;
      descEl.style.opacity = "1";
      descEl.style.transition = "opacity 0.5s ease";
      setTimeout(() => { descEl.style.opacity = "0"; }, 2500);
      setTimeout(() => { descEl.textContent = ""; descEl.style.opacity = "1"; }, 3000);
    }
    if (VOICE_ON) speak(hint);
    const missKey = KEYS.misses(i);
    const misses = (Number(LS.get(missKey, 0)) | 0) + 1;
    LS.set(missKey, misses);
    _attemptSequence.push({ mod: got, timestamp: Date.now() });
    _chamberProbe('refrax', got, misses, 'part_' + i, row.part, need);
    return;
  }

  // Check if retry should be blocked BEFORE launching mini-game
  const sessionAttempts = Number(LS.get(KEYS.misses(i), 0)) || 0;
  const sessionPoints = sessionAttempts === 0 ? 2 : sessionAttempts === 1 ? 1 : 0;
  const isAlreadyDone = Progress.partDone(i);
  const currentBest = window.GlobalPoints ? 
    window.GlobalPoints.getPartBests('refrax')[i - 1] || 0 : 0;
  
  // Only block if part is already done AND no improvement possible
  if (isAlreadyDone && currentBest >= sessionPoints) {
    console.log(`⚠️ Part ${i} retry blocked - already done with best score (${currentBest}) >= potential (${sessionPoints})`);
    if (VOICE_ON) speak("You already have the best possible score for this part. Focus on other parts to improve your total.");
    return;
  }

  // success → inline mini
  const mini = document.createElement("div");
  mini.className = "mini";
  holder.appendChild(mini);
  const passed = await runMini(row, mini);

  if (passed) {
    if (sessionAttempts > 0 && window.trackEvent) {
      window.trackEvent('breakthrough_moment', {
        chamber: 'refrax',
        attempts_before_success: sessionAttempts,
        time_to_success: Math.floor((Date.now() - _chamberStartTime) / 1000),
        last_probe_text: _lastProbeShown || null,
        had_probe: !!_lastProbeShown,
        attempt_sequence: _attemptSequence || [],
        correct_mod: row?.mod || null,
        corridor_id: null,
        ms_since_probe_response: _lastProbeResponseTime ? Date.now() - _lastProbeResponseTime : null
      });
    }

    // Check if this part was already completed before (for retry detection)
    const wasPartAlreadyDone = Progress.partDone(i);
    
    // Report result to global points system (awards improvement only)
    const improvement = window.GlobalPoints ? window.GlobalPoints.reportPartResult('refrax', i, sessionPoints) : 0;
    
    // Track mod applied
    if (window.MaigiclyAnalytics) {
      window.MaigiclyAnalytics.track({
        event_name: 'mod_applied',
        qbit: 'refrax',
        chamber: 'refrax_chamber',
        part: `part_${i}`,
        action: 'drop_correct',
        value_num: sessionPoints,
        properties: { 
          mod: got,
          attempts: sessionAttempts,
          improvement: improvement 
        }
      });
    }
    
    // Trigger Forge unlock check and UI updates immediately after scoring
    if (window.GlobalPoints && improvement > 0) {
      window.GlobalPoints.updateProgressDisplay();  // Update points/UI first
      window.GlobalPoints.checkForgeUnlock();        // Then check if Forge should unlock
    }
    
    // Clear local attempt tracking
    LS.set(KEYS.misses(i), 0);
    LS.set(KEYS.hintIdx(i), 0);

    Progress.setPart(i);
    award(improvement); // Award the improvement points for local UI

    holder.classList.add("done");
    const done = document.createElement("div");
    done.className = "muted";
    done.textContent = `✔ ${need} fixed`;
    holder.appendChild(done);
    // Individual part success - no story yet
    
    // Play individual success audio unless triggering chamber completion
    const allPartsNowDone = [1,2,3].every(x => Progress.partDone(x));
    // Only trigger completion if we just finished all parts AND haven't triggered completion this session
    const shouldTriggerCompletion = allPartsNowDone && !__refraxCompletedOnce;
    
    if (VOICE_ON && !shouldTriggerCompletion) {
      speak(row.success);
    }
    
    // Debug completion status with more detail
    console.log(`🎯 Part ${i} mini-game completed successfully!`);
    const partsStatus = [1,2,3].map(x => Progress.partDone(x));
    console.log(`Parts status after completion:`, partsStatus);
    console.log("All parts done:", allPartsNowDone, "Should trigger completion:", shouldTriggerCompletion);
    
    if (shouldTriggerCompletion) {
      console.log("🎉 REFRAX COMPLETED! Triggering completion sequence...");
      __refraxCompletedOnce = true;
      Progress.setComplete();
      LS.set(KEYS.complete, "true"); // Persist completion state
      localStorage.setItem('refrax.completedAt', Date.now().toString()); // Store completion timestamp
      // Back up unlock + points so an Operator Code restore brings them back.
      try {
        if (window.OperatorID && window.OperatorID.syncProgress && window.GlobalPoints) {
          window.OperatorID.syncProgress({
            'refrax.v3.complete': 'true',
            'quantum.chamber.refrax.earned': String(window.GlobalPoints.getChamberPoints('refrax')),
            'quantum.global.points': String(window.GlobalPoints.getTotal())
          });
        }
      } catch (e) {}
      // chamber_complete is tracked once, below, via window.ChamberCompletion.trackCompletion()
      // (do not also fire it here — that caused chamber_complete to log twice per completion)
      
      // Lock chamber to prevent further play
      document.querySelectorAll('.mod').forEach(mod => {
        mod.draggable = false;
        mod.style.opacity = '0.5';
        mod.style.cursor = 'not-allowed';
        mod.title = 'Chamber completed - no further modifications needed';
      });
      
      document.querySelectorAll('.part').forEach(part => {
        part.style.pointerEvents = 'none';
      });
      
      // Store story in localStorage for Engineering Log
      localStorage.setItem('refrax.story', REFRAX_STORY);
      
      // Use shared completion helper (bulletproof analytics + failsafe redirect)
      window.ChamberCompletion.trackCompletion({
        qbit: 'refrax',
        chamber: 'refrax_chamber',
        getPoints: () => window.GlobalPoints ? window.GlobalPoints.getChamberPoints('refrax') : 0,
        redirect: () => {
          // First check if Continuum should unlock (all 9 fixes: 4 chambers + 5 missions)
          if (window.ContinuumUnlock && window.ContinuumUnlock.checkContinuumUnlockAndRedirect()) {
            return; // Redirect to Continuum handled by helper
          }
          
          const allComplete = [
            localStorage.getItem('refrax.v3.complete') === 'true',
            localStorage.getItem('magnetica.v3.complete') === 'true', 
            localStorage.getItem('chrona.v3.complete') === 'true',
            localStorage.getItem('violetflicker.v3.complete') === 'true'
          ];
          if (allComplete.every(c => c)) {
            console.log("🎊 FINAL CHAMBER COMPLETED! Showing recovered log...");
            window.location.href = '/recovered-log.html';
          } else {
            console.log("🚀 Redirecting to Comic Viewer to show Refrax story...");
            window.location.href = '/comic.html?qbit=refrax';
          }
        },
        ratingTitle: 'How was the Refrax Chamber?',
        ratingSubtitle: 'Rate your experience with light refraction puzzles'
      });
      
      // finale line (force play even if voice is off)
      speak("Refrax is awakened.", { force:true });
    } else if (Progress.isComplete()) {
      console.log("⚠️ Chamber already completed once - no redirect");
    } else {
      console.log(`⏳ Still need to complete: ${[1,2,3].filter(x => !Progress.partDone(x)).join(', ')}`);
    }
  } else {
    if (window.MaigiclyAnalytics) {
      window.MaigiclyAnalytics.track({ event_name: 'mod_removed', chamber: 'refrax', part: `part_${i}`, properties: { mod: got } });
    }
    if (VOICE_ON) speak("Close. Try again.");
    mini.remove();
  }
}

/* ================= Drag & drop (on .part cards) ================= */
chamber.addEventListener("dragover", e=>{
  if (e.target.closest(".part")) e.preventDefault();
});

chamber.addEventListener("drop", async (e)=>{
  const holder = e.target.closest(".part");
  if (!holder) return;
  e.preventDefault();

  const got = e.dataTransfer.getData("text/plain") || __lastDraggedMod || "";
  __lastDraggedMod = null;
  const i    = Number(holder.dataset.i);
  const row  = ROWS.find(r => r.i === i);
  if (!row) return;
  const need = row.mod;
  
  await handleDrop(holder, got, i, row, need);
});

/* ================= Minis ================= */
async function runMini(row, mount){
  if (row.mini === "tap_confirm") {
    return await new Promise(res=>{
      mount.innerHTML = `<div class="row"><span class="muted">Ready?</span><button class="btn" id="ok" type="button">Confirm</button></div>`;
      mount.querySelector("#ok")?.addEventListener("click", () => res(true));
    });
  }

  if (row.mini === "nudge_to_zone") {
    const { start=25, target=50, steps=10, tolerance=8 } = row.params;
    let pos = start, armTimer = null;
    const step = 100/steps, bandLeft = target - tolerance, bandRight = target + tolerance;

    mount.innerHTML = `
      <div id="nudgeRow" tabindex="0" aria-label="Nudge to target zone">
        <div class="row">
          <span class="muted">Target zone</span>
          <button class="btn ghost" id="left"  type="button">◀</button>
          <button class="btn ghost" id="right" type="button">▶</button>
        </div>
        <div class="track" id="track">
          <div class="band" style="left:${bandLeft}%; right:${100-bandRight}%;"></div>
          <div class="marker" id="marker" style="left:${start}%"></div>
        </div>
      </div>
      <div class="muted" id="status" style="margin-top:6px">Nudge until the marker glows, then hold a moment.</div>`;

    const marker = mount.querySelector("#marker");
    const status = mount.querySelector("#status");
    const left   = mount.querySelector("#left");
    const right  = mount.querySelector("#right");
    const rowEl  = mount.querySelector("#nudgeRow");

    function inRange(){ return pos >= bandLeft && pos <= bandRight; }
    let resolve; const p = new Promise(r => resolve = r);

    function armPass(){
      if (armTimer || !inRange()) return;
      if (marker) marker.style.boxShadow = "0 0 10px 2px rgba(125,211,252,.6)";
      if (status) status.textContent = "Nice — hold there…";
      armTimer = setTimeout(()=>{ armTimer=null; resolve(true); }, 650);
    }
    function disarm(){
      if (armTimer){ clearTimeout(armTimer); armTimer=null; }
      if (marker) marker.style.boxShadow = "none";
      if (status) status.textContent = "Nudge until the marker glows, then hold a moment.";
    }
    function paint(){ if (marker) marker.style.left = `${pos}%`; inRange() ? armPass() : disarm(); }

    left ?.addEventListener("click", ()=>{ pos = Math.max(0,  +(pos - step).toFixed(2)); paint(); });
    right?.addEventListener("click", ()=>{ pos = Math.min(100, +(pos + step).toFixed(2)); paint(); });

    rowEl?.addEventListener("keydown", (e)=>{
      if (e.key === "ArrowLeft")  { e.preventDefault(); pos = Math.max(0,  +(pos - step).toFixed(2)); paint(); }
      if (e.key === "ArrowRight") { e.preventDefault(); pos = Math.min(100, +(pos + step).toFixed(2)); paint(); }
    });

    paint(); return await p;
  }

  if (row.mini === "hold_steady") {
    const { seconds=4 } = row.params;
    mount.innerHTML = `
      <div class="row">
        <span class="muted">Hold to lock</span>
        <button class="btn" id="hold" type="button">Hold</button>
      </div>
      <div class="bar" style="margin-top:8px"><div class="fill" id="fill"></div></div>`;
    const fill = mount.querySelector("#fill");
    const btn  = mount.querySelector("#hold");
    let timer=null, t=0; const total = seconds * 20;
    let resolve; const p = new Promise(r => resolve = r);

    function step(){ t++; if (fill) fill.style.width = `${(t/total)*100}%`; if (t>=total){ stop(); resolve(true); } }
    function start(){ if (timer) return; timer = setInterval(step, 50); }
    function stop(){ if (timer){ clearInterval(timer); timer=null; } }

    btn ?.addEventListener("pointerdown", (e)=>{ e.preventDefault(); start(); }, {passive:false});
    window.addEventListener("pointerup",   stop);
    btn ?.addEventListener("keydown", (e)=>{ if(e.code==="Space"){ e.preventDefault(); start(); } }, {passive:false});
    btn ?.addEventListener("keyup",   (e)=>{ if(e.code==="Space"){ e.preventDefault(); stop(); } }, {passive:false});

    return await p;
  }

  return true;
}

/* ================= helpers & boot ================= */
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

paintStats(); // finale line plays even if Voice is Off (force:true)

// ─── Probe + Mic state machine ───────────────────────────────────────────────
// States: idle | listening | submitting | error
// One container, one rec instance, never duplicated.

let _chamberStartTime = Date.now();
let _lastProbeShown = null;
let _attemptSequence = [];
let _currentAttemptedFix = '';
let _currentAttemptNumber = 0;
// Last failed-drop context (hackathon step 9): remembered from _chamberProbe
// so typed follow-ups (_doSend) carry the same context as the first probe.
let _currentTargetPartId = '';
let _currentTargetPartName = '';
let _currentAttemptedMod = '';
let _currentCorrectMod = '';
let _currentDroppedIntoSlot = '';
let _currentCorrectModForSlot = '';
var _probeSubmitCount = {};
let _probeTimerId = null;
let _lastProbeResponseTime = null;
var _probeLastKey = '';

function _logProbeEvent(cName, qName, evtName, extra) {
  var base = {
    session_id: localStorage.getItem('current_session_id') || '',
    architect_id: localStorage.getItem('maigicly_architect_id') || localStorage.getItem('architect_id') || '',
    chamber: cName, qbit: qName, mission_id: 'refrax',
    part_or_slot: _currentAttemptedFix || '',
    attempted_fix: _currentAttemptedFix || '',
    attempt_number: _currentAttemptNumber || 0
  };
  fetch('/api/track-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ event_name: evtName }, base, extra)) }).catch(function() {});
}

function _applyProbeLimit(qName) {
  var msg = 'Got it. Try something different.';
  var inp = document.getElementById('probeTextInput');
  var btn = document.getElementById('probeTextSubmit');
  var limitEl = document.getElementById('probeTextLimit');
  if (inp) { inp.disabled = true; inp.style.opacity = '0.4'; }
  if (btn) { btn.disabled = true; btn.style.display = 'none'; }
  if (limitEl) { limitEl.textContent = msg; limitEl.style.display = 'block'; }
}

function _chamberProbe(chamberName, modTried, attemptNumber, partId, droppedIntoSlot, correctModForSlot) {
  _currentAttemptedFix = partId || modTried;
  _currentAttemptNumber = attemptNumber;
  _currentTargetPartId = partId || '';
  _currentTargetPartName = droppedIntoSlot || '';
  _currentAttemptedMod = modTried || '';
  _currentCorrectMod = correctModForSlot || '';
  _currentDroppedIntoSlot = droppedIntoSlot || '';
  _currentCorrectModForSlot = correctModForSlot || '';
  if (window.trackEvent) {
    window.trackEvent('wrong_drop', {
      chamber: chamberName,
      attempted_fix: modTried,
      target_slot: partId || '',
      dropped_into_slot: droppedIntoSlot || '',
      correct_mod_for_slot: correctModForSlot || '',
      attempt_number: attemptNumber,
      ms_since_probe_response: _lastProbeResponseTime ? Date.now() - _lastProbeResponseTime : null
    });
  }
  _logProbeEvent(chamberName, 'Refrax', 'probe_shown', { text_submission_count: _probeSubmitCount[_currentAttemptedFix] || 0, probe_limited: false, result: 'wrong' });
  fetch('/api/chamber-probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      architect_id: localStorage.getItem('maigicly_architect_id') || localStorage.getItem('architect_id') || '',
      session_id: localStorage.getItem('current_session_id') || '',
      chamber: 'refrax', qbit_name: 'Refrax',
      attempted_fix: modTried, attempt_number: attemptNumber, result: 'wrong',
      dropped_into_slot: droppedIntoSlot || '',
      correct_mod_for_slot: correctModForSlot || '',
      target_part_id: partId || '',
      target_part_name: droppedIntoSlot || '',
      attempted_mod: modTried || '',
      correct_mod: correctModForSlot || ''
    })
  })
  .then(function (r) { return r.json(); })
  .then(function (data) {
    if (!data.probe) return;
    _lastProbeShown = data.probe;
    var probeEl = document.getElementById('continuum-probe');
    if (!probeEl) {
      probeEl = document.createElement('div');
      probeEl.id = 'continuum-probe';
      probeEl.style.cssText = 'margin-top:18px;padding:14px 18px;color:#7dd3fc;font-size:13px;font-style:italic;text-align:center;opacity:0;transition:opacity 0.8s ease;background:rgba(6,12,28,0.97);border-radius:12px;border:1px solid rgba(125,211,252,0.15);';
      var chamberEl = document.getElementById('chamber');
      if (chamberEl && chamberEl.parentNode) chamberEl.parentNode.insertBefore(probeEl, chamberEl.nextSibling);
      else document.body.appendChild(probeEl);
    }
    probeEl.textContent = '◈  ' + data.probe;
    probeEl.style.opacity = '1';
    if (_probeTimerId) clearTimeout(_probeTimerId);
    _probeTimerId = setTimeout(function () {
      probeEl.style.opacity = '0';
      probeEl.style.height = '0';
      probeEl.style.padding = '0';
      probeEl.style.margin = '0';
      probeEl.style.overflow = 'hidden';
      setTimeout(function () { probeEl.style.display = 'none'; }, 400);
    }, 30000);
    setTimeout(() => {
      probeEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    _showTextInput('refrax', 'Refrax', probeEl);
  })
  .catch(function () {});
}

function _showTextInput(chamberName, qbitLabel, probeEl) {
  var key = _currentAttemptedFix || '';
  var box = document.getElementById('probeTextBox');
  if (box) {
    if (key !== _probeLastKey) {
      _probeLastKey = key;
      var ri = document.getElementById('probeTextInput');
      var rb = document.getElementById('probeTextSubmit');
      var rs = document.getElementById('probeTextStatus');
      var rl = document.getElementById('probeTextLimit');
      if (ri) { ri.disabled = false; ri.style.opacity = '1'; ri.value = ''; }
      if (rb) { rb.disabled = false; rb.style.opacity = '1'; rb.style.display = ''; }
      if (rs) rs.textContent = '';
      if (rl) rl.style.display = 'none';
    }
    if ((_probeSubmitCount[key] || 0) >= 3) { _applyProbeLimit(qbitLabel); }
    box.style.display = 'block';
    return;
  }
  _probeLastKey = key;
  var _micUsed = false;
  box = document.createElement('div');
  box.id = 'probeTextBox';
  box.style.cssText = 'margin-top:12px;text-align:center;background:rgba(6,12,28,0.97);border-radius:12px;padding:14px 16px;border:1px solid rgba(125,211,252,0.12);';
  box.innerHTML =
    '<div style="font-size:11px;color:#57d3ff;letter-spacing:0.1em;margin-bottom:4px;">SUPPORT SYSTEM ACTIVATED</div>' +
    '<div style="font-size:12px;color:#9aa3b2;margin-bottom:6px;">What do you know about this?</div>' +
    '<div style="display:flex;gap:8px;justify-content:center;align-items:center;">' +
      '<input id="probeTextInput" type="text" placeholder="I tried this because..." style="background:rgba(87,211,255,0.07);border:1px solid #57d3ff;border-radius:10px;color:#e2e8f0;padding:7px 12px;font-size:13px;width:220px;outline:none;">' +
      '<button id="probeTextMic" style="background:rgba(87,211,255,0.1);border:1px solid #57d3ff;border-radius:10px;color:#57d3ff;padding:7px 10px;cursor:pointer;font-size:15px;line-height:1;" title="Speak your answer">🎤</button>' +
      '<button id="probeTextSubmit" style="background:rgba(87,211,255,0.1);border:1px solid #57d3ff;border-radius:10px;color:#57d3ff;padding:7px 14px;cursor:pointer;font-size:13px;">Send</button>' +
    '</div>' +
    '<div id="probeTextStatus" style="margin-top:8px;font-size:12px;color:#9aa3b2;min-height:16px;"></div>' +
    '<div id="probeTextLimit" style="display:none;margin-top:8px;font-size:12px;color:#94a3b8;font-style:italic;padding:6px 12px;border-top:1px solid rgba(255,255,255,0.06);"></div>';
  function _doSend() {
    var inp = document.getElementById('probeTextInput');
    var statusEl = document.getElementById('probeTextStatus');
    var btn = document.getElementById('probeTextSubmit');
    var val = inp ? inp.value.trim() : '';
    if (!val || (btn && btn.disabled)) return;
    var usedMic = _micUsed;
    _micUsed = false;
    var k = _currentAttemptedFix || '';
    var count = (_probeSubmitCount[k] || 0) + 1;
    _probeSubmitCount[k] = count;
    if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
    if (statusEl) statusEl.textContent = 'Sending\u2026';
    _logProbeEvent(chamberName, qbitLabel, 'voice_capture', { transcript: val, input_type: usedMic ? 'speech' : 'text', mic_used: usedMic, text_submission_count: count, result: 'wrong' });
    fetch('/api/chamber-probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        architect_id: localStorage.getItem('maigicly_architect_id') || localStorage.getItem('architect_id') || '',
        session_id: localStorage.getItem('current_session_id') || '',
        chamber: chamberName, qbit_name: qbitLabel,
        attempted_fix: _currentAttemptedFix || '', attempt_number: _currentAttemptNumber || 0,
        dropped_into_slot: _currentDroppedIntoSlot || '', correct_mod_for_slot: _currentCorrectModForSlot || '',
        target_part_id: _currentTargetPartId || '', target_part_name: _currentTargetPartName || '',
        attempted_mod: _currentAttemptedMod || '', correct_mod: _currentCorrectMod || '',
        voice_transcript: val, prompt_type: 'voice_response',
        mic_used: usedMic, input_type: usedMic ? 'speech' : 'text', result: 'wrong', text_submission_count: count
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (inp) inp.value = '';
      if (statusEl) statusEl.textContent = '';
      _logProbeEvent(chamberName, qbitLabel, 'probe_response_received', { text_submission_count: count, response_text: data.probe || '', result: 'wrong' });
      _lastProbeResponseTime = Date.now();
      if (data.probe) {
        var p = document.getElementById('continuum-probe');
        if (p) { if (_probeTimerId) { clearTimeout(_probeTimerId); _probeTimerId = null; } p.style.display = 'block'; p.style.height = 'auto'; p.style.padding = '14px 18px'; p.style.margin = '18px 0 0 0'; p.style.overflow = 'visible'; p.textContent = '◈  ' + data.probe; p.style.opacity = '1'; console.log('[Continuum Debug] user said:', val, '| response:', data.probe, '| display:', p.style.display, '| height:', p.offsetHeight, '| opacity:', p.style.opacity); p.scrollIntoView({ behavior: 'smooth', block: 'center' }); _probeTimerId = setTimeout(function() { p.style.opacity = '0'; }, 30000); }
      }
      if (count >= 3) {
        var msg = 'Got it. Try something different.';
        _logProbeEvent(chamberName, qbitLabel, 'probe_limit_reached', { text_submission_count: 3, fallback_message: msg, probe_limited: true });
        _applyProbeLimit(qbitLabel);
        _logProbeEvent(chamberName, qbitLabel, 'fallback_nudge_shown', { text_submission_count: 3, fallback_message: msg, probe_limited: true });
      } else {
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      }
    })
    .catch(function(err) {
      if (inp) inp.value = '';
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
      if (statusEl) statusEl.textContent = 'Error \u2014 try again.';
      _logProbeEvent(chamberName, qbitLabel, 'probe_error', { text_submission_count: count, error_message: err ? err.message || String(err) : 'unknown', result: 'wrong' });
    });
  }
  if (probeEl && probeEl.parentNode) probeEl.parentNode.insertBefore(box, probeEl.nextSibling);
  else document.body.appendChild(box);
  document.getElementById('probeTextSubmit').addEventListener('click', _doSend);
  document.getElementById('probeTextInput').addEventListener('keydown', function(e) { if (e.key === 'Enter') _doSend(); });
  var micBtn = document.getElementById('probeTextMic');
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    if (micBtn) micBtn.style.display = 'none';
  } else {
    micBtn.addEventListener('click', function() {
      var inp = document.getElementById('probeTextInput');
      try {
        var recog = new SR();
        recog.lang = 'en-US';
        recog.interimResults = false;
        recog.maxAlternatives = 1;
        recog.onstart = function() { micBtn.textContent = '🔴'; micBtn.disabled = true; };
        recog.onresult = function(e) {
          var transcript = e.results[0][0].transcript;
          if (inp) inp.value = transcript;
          _micUsed = true;
          _doSend();
        };
        recog.onerror = function() { micBtn.textContent = '🎤'; micBtn.disabled = false; };
        recog.onend = function() { micBtn.textContent = '🎤'; micBtn.disabled = false; };
        recog.start();
      } catch(e) {}
    });
  }
}

// Track chamber entry + time spent + abandon
if (window.MaigiclyAnalytics) {
  const _chamberEntryTime = Date.now();
  const _chamberName = 'refrax';
  window.MaigiclyAnalytics.track('enter_chamber', { chamber: _chamberName });
  window.addEventListener('beforeunload', () => {
    const _timeSpent = Math.round((Date.now() - _chamberEntryTime) / 1000);
    window.MaigiclyAnalytics.track({ event_name: 'chamber_time_spent', chamber: _chamberName, seconds: _timeSpent });
    if (localStorage.getItem(_chamberName + '.v3.complete') !== 'true') {
      window.MaigiclyAnalytics.track({ event_name: 'chamber_abandon', chamber: _chamberName, seconds: _timeSpent });
    }
  });
}