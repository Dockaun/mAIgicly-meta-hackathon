// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
//
// ============================================================
// STATIC FALLBACK ONLY — NOT A PRIMARY ENTRY POINT
// ============================================================
// This file provides window.RefinedForgeHints as a static fallback
// data object used by forge-companion.js (lines 72-75) when the
// /api/forge-probe API call fails.
//
// window.showMissionHint defined here is OVERRIDDEN at load time
// by forge-companion.js (line 244) — this version is never called
// in normal operation. Do NOT add new logic here.
//
// The live hint system lives in:
//   - forge-companion.js  (primary: calls /api/forge-probe)
//   - server.js /api/forge-probe  (AI-powered probe response)
// ============================================================
//
// Refined Enhanced Forge Hint System
// "Quantum-Native" Edition: High-concept science, clear engineering logic.

window.RefinedForgeHints = {
  
  // 1. The Archaeology (Keep the cool names)
  ancientSystems: {
    "Harmonic Tuning": {
      system: "Resonance Stabilization Network",
      purpose: "prevented quantum decay across the grid",
      chamberConnection: "Recall Magnetica: You had to find the stable frequency.",
      crisis: "The grid is vibrating out of phase. It needs a Reference Signal."
    },
    "Entanglement": {
      system: "Quantum Uplink", 
      purpose: "linked distant processors into a single mind",
      chamberConnection: "Recall Chrona: Two events happening at the exact same moment.",
      crisis: "The twin-link has severed. We need to re-bind the particle pair."
    },
    "Coherence Stitching": {
      system: "Lattice Error Correction",
      purpose: "maintained data integrity over millennia", 
      chamberConnection: "Recall Refrax: Guiding light without losing the signal.",
      crisis: "The waveform is fraying. We need to reflect and realign the path."
    },
    "Energy Absorption": {
      system: "Entropy Sink",
      purpose: "grounded dangerous surges",
      chamberConnection: "Recall the safety limits. Energy must go somewhere.",
      crisis: "Critical Overload imminent. We need a buffer to catch the spike."
    },
    "Stealth / Masking": {
      system: "Signal Cloak", 
      purpose: "shielded operations from observation",
      chamberConnection: "Recall Violet Flicker: The plasma hid the core.",
      crisis: "The signal is exposed. We need to shift it into a blind spot."
    }
  },

  // 2. The Mechanics (Scientific but Actionable)
  toolReasons: {
    "Harmonic Tuning": {
      "Shimmer Splitter": "Places the signal into Superposition so we can compare two states.",
      "Phase Prism": "Adjusts the timing offset to find the harmonic 'sweet spot'.",
      "Readout": "Collapses the wavefunction to confirm the frequency is locked."
    },
    "Entanglement": {
      "Shimmer Splitter": "Generates the entangled particle pair.",
      "Delay Gate": "Holds one particle until the other arrives (Synchronization).",
      "Readout": "Measures the Bell State to confirm the link."
    },
    "Coherence Stitching": {
      "Field Mirror": "Redirects the field geometry.",
      "Coil Phase": "Corrects spin drift to maintain coherence.",
      "Hall Sensor": "Detects the alignment of the magnetic flux."
    },
    "Energy Absorption": {
      "Choice Buffer": "Stabilizes the input before it hits the sink.",
      "Delay Gate": "Regulates the flow rate to prevent blowout.", 
      "Light Catcher": "The final trap that absorbs the photon energy."
    },
    "Stealth / Masking": {
      "Shimmer Splitter": "Splits the beam: one path for data, one for decoy.",
      "Phase Prism": "Shifts the signal phase to create destructive interference (Invisibility).",
      "Light Catcher": "Receives the masked data packet."
    }
  },

  // 3. Progressive Hints
  getSystemHint(missionName, attemptCount) {
    const system = this.ancientSystems[missionName];
    const tools = this.toolReasons[missionName];
    
    if (!system) return this.getGenericHint(attemptCount);

    // Hint 1: The Engineering Context
    if (attemptCount === 1) {
      return {
        title: `Restoring the ${system.system}`,
        message: `Status: ⚠️ ${system.crisis}
        
        Objective: Rebuild the mechanism that ${system.purpose}.
        
        Logic: ${system.chamberConnection}`
      };
    }
    
    // Hint 2: The Quantum Protocol (The Logic)
    else if (attemptCount === 2) {
      return {
        title: `Engineering Protocol`,
        message: `To stabilize this system, apply the Standard Quantum Chain:

1. SUPERPOSE (Split/Open): Create multiple paths or states.
2. MODULATE (Phase/Align): Adjust the timing or spin.
3. COLLAPSE (Measure/Catch): Lock the final result.

Which components perform these functions?`
      };
    }
    
    // Hint 3: The Component List
    else if (attemptCount === 3) {
      const toolNames = Object.keys(tools);
      const list = toolNames.map(name => `• ${name}`).join('\n');
      
      return {
        title: `Required Architecture`,
        message: `Diagnostic scan suggests these components are optimal:

${list}

(Consult the component tooltips to match their functions)`
      };
    }
    
    // Hint 4: The Emergency Override (Your Update)
    else {
      return {
        title: `🚨 EMERGENCY OVERRIDE`,
        message: `Auto-Repair Protocol Activated:

${Object.keys(tools).map(tool => `• ${tool}: ${tools[tool]}`).join('\n\n')}

Required Fixes: SH (Open), F:: (Align), C// (Lock).

[This configuration will restore the ${system.system}]`
      };
    }
  },

  getSystemValidationHint(validationIssue, missionName) {
    // If they picked wrong parts
    if (validationIssue === 'missingParts') {
      return {
        title: "Architecture Incomplete",
        message: "Your Qbit lacks a critical subsystem.\n\nReview the Protocol: Open → Align → Lock."
      };
    }
    
    // If they picked wrong fixes
    if (validationIssue === 'missingFixes') {
      return {
        title: "Stability Error",
        message: "The machine is unstable. You need exactly 2 Fixes:\n• SH: To maintain Superposition.\n• F:: or C//: To Collapse or Align the result."
      };
    }
    
    return {
      title: "Calibration Needed",
      message: "The components are correct, but the configuration is out of sync. Check the Strategy Guide."
    };
  },

  getSystemStrategy(missionName) {
    const system = this.ancientSystems[missionName];
    if (!system) return { title: "Hint", message: "Check your tools." };

    return {
      title: `${system.system} Blueprint`,
      message: `Operational Theory:

To restore ${system.purpose}, you must construct a chain that splits the quantum state, modifies one half, and recombines them.

Sequence: Splitter -> Modifier -> Sensor.`
    };
  },
  
  getGenericHint(attemptCount) {
    return {
      title: "System Error",
      message: "Ensure you have a Source, a Modifier, and a Receiver."
    };
  }
};

function showEnhancedHint(hintData) {
  const hintNotification = document.getElementById('hintNotification');
  const hintOverlay = document.getElementById('hintOverlay');
  
  if (!hintNotification || !hintOverlay) {
    console.warn('Hint elements not found in DOM');
    return;
  }
  
  const titleEl = hintNotification.querySelector('h3') || hintNotification.querySelector('.hint-title');
  const msgEl = hintNotification.querySelector('.hint-message') || hintNotification.querySelector('p');
  
  if(titleEl) titleEl.textContent = hintData.title;
  if(msgEl) msgEl.innerHTML = hintData.message.replace(/\n/g, '<br>');
  
  hintOverlay.style.display = 'block';
  hintNotification.style.display = 'block';
  if (window.MaigiclyAnalytics) {
    window.MaigiclyAnalytics.track({ event_name: 'forge_hint_shown', properties: { title: hintData.title } });
  }
}

window.showMissionHint = function(missionName, attempt, issue) {
  const data = issue 
    ? window.RefinedForgeHints.getSystemValidationHint(issue, missionName)
    : window.RefinedForgeHints.getSystemHint(missionName, attempt);
  showEnhancedHint(data);
};

window.showSystemStrategy = function(missionName) {
  const data = window.RefinedForgeHints.getSystemStrategy(missionName);
  showEnhancedHint(data);
};
