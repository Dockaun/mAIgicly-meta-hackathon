// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
// Centralized reset system for public game access
// Ensures complete cleanup of all persisted data for fresh player starts

// ================= SAVE VERSION SYSTEM =================
// Bump this version to force a fresh start for ALL players on next release
// Change '2' to '3', '4', etc. when you want everyone to start fresh
const SAVE_VERSION = '2';

window.ResetSystem = {
  
  // Core reset logic - shared by both silent and interactive reset
  _performReset(silent = false) {
    console.log('🧹 Starting complete progress reset...');
    
    // Clear all localStorage with known prefixes
    this.clearLocalStorageByPrefixes([
      'refrax.',
      'magnetica.',
      'chrona.',
      'violetflicker.',
      'violet.',  // Legacy name
      'beano.',   // Another legacy name
      'quantum.',  // This includes quantum.global.points and all GlobalPoints data
      'forge.',
      'resonance.',
      'engineeringLog.',
      'chat.',    // Chat history if any
      'transcript.', // Transcript data if any
      'continuum.'     // Continuum Tactical score
    ]);
    
    // Also clear GlobalPoints system explicitly
    if (window.GlobalPoints) {
      window.GlobalPoints.reset();
    }
    
    // Clear forged Qbits from localStorage (now stored locally, not in shared database)
    try {
      if (window.ForgedQbitsStore) {
        window.ForgedQbitsStore.clear();
      } else {
        // Fallback if store isn't loaded
        localStorage.removeItem('forged-qbits.local');
      }
      console.log('🗑️ Cleared forged Qbits from local storage');
    } catch (error) {
      console.warn('⚠️ Error clearing forged Qbits:', error.message);
    }
    
    // Clear specific known keys that might not match prefixes.
    // IMPORTANT: Identity keys are intentionally excluded — version reset must never
    // wipe a returning player's architect ID, user ID, alias, or player name.
    // Identity keys preserved: maigicly_architect_id, maigicly_user_id,
    //   resonanceAlias, player_alias, operator_id, operator_id_confirmed
    const specificKeys = [
      'qbit-selection-voice-played',
      'hasPlayedIntro',
      'selectedQbit',
      'currentChatSession',
      // Chamber completion flags (explicit clear)
      'refrax.v3.complete',
      'magnetica.v3.complete', 
      'chrona.v3.complete',
      'violetflicker.v3.complete',
      // Individual part completion flags
      'refrax.v3.part.1', 'refrax.v3.part.2', 'refrax.v3.part.3',
      'magnetica.v3.part.1', 'magnetica.v3.part.2', 'magnetica.v3.part.3',
      'chrona.v3.part.1', 'chrona.v3.part.2', 'chrona.v3.part.3', 
      'violetflicker.v3.part.1', 'violetflicker.v3.part.2', 'violetflicker.v3.part.3',
      // Stories
      'refrax.story', 'magnetica.story', 'chrona.story', 'violetflicker.story',
      // Qbit migration marker (safe to reset — not identity)
      'forged-qbits.migrated',
      'forged-qbits.local'
    ];
    
    specificKeys.forEach(key => {
      localStorage.removeItem(key);
      if (!silent) console.log(`🗑️ Cleared localStorage: ${key}`);
    });
    
    // Clear all sessionStorage for fresh session
    console.log('🗑️ Clearing sessionStorage...');
    sessionStorage.clear();
    
    console.log('✅ Reset complete - all data cleared');
  },

  // Silent reset for version mismatch (no confirmation, no redirect)
  silentReset() {
    this._performReset(true);
  },

  // Comprehensive reset that clears ALL game data (with confirmation)
  async resetAllProgress() {
    // Show custom styled modal instead of browser confirm
    const confirmed = await this.showCustomConfirm();
    if (!confirmed) {
      return false;
    }
    
    this._performReset(false);
    
    // Redirect to intro page for new player experience
    window.location.href = '/';
    return true;
  },
  
  // Show custom styled confirmation modal
  showCustomConfirm() {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(10, 10, 15, 0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        animation: fadeIn 0.2s ease-out;
      `;
      
      // Create modal content
      const modal = document.createElement('div');
      modal.style.cssText = `
        background: #12121a;
        border: 1px solid #2a2f45;
        border-radius: 16px;
        padding: 32px;
        max-width: 440px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(87, 211, 255, 0.1);
      `;
      
      modal.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <h3 style="color: #57d3ff; margin: 0 0 12px 0; font-size: 20px;">Reset All Progress</h3>
          <p style="color: #9aa3b2; margin: 0 0 24px 0; line-height: 1.5;">
            This will clear all chamber progress, forged Qbits, and points for a fresh start.
          </p>
          <p style="color: #cbd5e1; margin: 0 0 28px 0; font-weight: 500;">
            Are you sure you want to continue?
          </p>
          <div style="display: flex; gap: 12px; justify-content: center;">
            <button id="modalCancel" style="
              background: #1a1f34;
              color: #eaf2ff;
              border: 1px solid #2d3354;
              border-radius: 10px;
              padding: 12px 24px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
              transition: all 0.2s;
            ">Cancel</button>
            <button id="modalConfirm" style="
              background: rgba(239, 68, 68, 0.15);
              color: #fca5a5;
              border: 1px solid rgba(239, 68, 68, 0.4);
              border-radius: 10px;
              padding: 12px 24px;
              cursor: pointer;
              font-size: 14px;
              font-weight: 500;
              transition: all 0.2s;
            ">Reset Progress</button>
          </div>
        </div>
      `;
      
      // Add hover effects
      const style = document.createElement('style');
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        #modalCancel:hover {
          background: #2a2f44;
          border-color: #7c9eff;
        }
        #modalConfirm:hover {
          background: rgba(239, 68, 68, 0.25);
          border-color: rgba(239, 68, 68, 0.6);
        }
      `;
      document.head.appendChild(style);
      
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      
      // Button handlers
      document.getElementById('modalCancel').onclick = () => {
        document.body.removeChild(overlay);
        document.head.removeChild(style);
        resolve(false);
      };
      
      document.getElementById('modalConfirm').onclick = () => {
        // Track reset event before executing
        if (window.MaigiclyAnalytics) {
          window.MaigiclyAnalytics.track('reset_progress', { 
            reason: 'user_initiated' 
          });
        }
        
        document.body.removeChild(overlay);
        document.head.removeChild(style);
        resolve(true);
      };
      
      // Click outside to cancel
      overlay.onclick = (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
          document.head.removeChild(style);
          resolve(false);
        }
      };
    });
  },
  
  // Helper to clear localStorage by prefixes
  clearLocalStorageByPrefixes(prefixes) {
    const keys = Object.keys(localStorage);
    
    keys.forEach(key => {
      const shouldClear = prefixes.some(prefix => key.startsWith(prefix));
      if (shouldClear) {
        localStorage.removeItem(key);
        console.log(`🗑️ Cleared localStorage: ${key}`);
      }
    });
  },
  
  // Create and style a reset button
  createResetButton() {
    const button = document.createElement('button');
    button.id = 'resetBtn';
    button.className = 'nav-btn';
    button.textContent = 'New Player';
    button.style.background = 'rgba(239, 68, 68, 0.2)';
    button.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    
    button.addEventListener('click', () => this.resetAllProgress().catch(console.error));
    
    return button;
  }
};

// ================= VERSION CHECK ON LOAD =================
// This runs after ResetSystem is defined, checking for version mismatch
(function checkAndResetVersion() {
  const storedVersion = localStorage.getItem('saveVersion');
  
  if (storedVersion !== SAVE_VERSION) {
    console.log(`🔄 Save version mismatch: stored=${storedVersion}, current=${SAVE_VERSION}`);
    console.log('🧹 Auto-wiping all save data for new release...');
    
    // Set the new version FIRST to avoid loops
    localStorage.setItem('saveVersion', SAVE_VERSION);
    
    // Use the centralized reset system for complete cleanup
    window.ResetSystem.silentReset();
    
    console.log(`✅ Save data wiped. New version: ${SAVE_VERSION}`);
  } else {
    console.log(`✅ Save version OK: ${SAVE_VERSION}`);
  }
})();