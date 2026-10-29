// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
// Global Points System for Quantum Chamber Game
// Tracks cumulative points across all chambers for Forge unlock

const GlobalPoints = {
  // Key for storing total points across all chambers
  TOTAL_KEY: 'quantum.global.points',
  
  // Keys for tracking chamber-specific earned points (permanent record)
  CHAMBER_KEYS: {
    refrax: 'quantum.chamber.refrax.earned',
    magnetica: 'quantum.chamber.magnetica.earned', 
    chrona: 'quantum.chamber.chrona.earned',
    violetflicker: 'quantum.chamber.violetflicker.earned'
  },
  
  // Keys for tracking per-part attempts globally (prevents farming)
  ATTEMPT_KEYS: {
    refrax: 'quantum.chamber.refrax.attempts',
    magnetica: 'quantum.chamber.magnetica.attempts',
    chrona: 'quantum.chamber.chrona.attempts', 
    violetflicker: 'quantum.chamber.violetflicker.attempts'
  },
  
  // Keys for tracking best score per part (allows improvement)
  BEST_KEYS: {
    refrax: 'quantum.chamber.refrax.best',
    magnetica: 'quantum.chamber.magnetica.best',
    chrona: 'quantum.chamber.chrona.best',
    violetflicker: 'quantum.chamber.violetflicker.best'
  },
  
  // Get total points earned across all chambers
  getTotal() {
    return Number(localStorage.getItem(this.TOTAL_KEY) || 0);
  },
  
  // Get points earned in a specific chamber
  getChamberPoints(chamber) {
    const key = this.CHAMBER_KEYS[chamber];
    return key ? Number(localStorage.getItem(key) || 0) : 0;
  },
  
  // Get attempts for a specific chamber part
  getPartAttempts(chamber, partIndex) {
    const key = this.ATTEMPT_KEYS[chamber];
    if (!key) return 0;
    const attempts = JSON.parse(localStorage.getItem(key) || '[0,0,0]'); // 3 parts per chamber
    return attempts[partIndex - 1] || 0;
  },
  
  // Get best scores for chamber parts [part1Best, part2Best, part3Best]
  getPartBests(chamber) {
    const key = this.BEST_KEYS[chamber];
    if (!key) return [0, 0, 0];
    return JSON.parse(localStorage.getItem(key) || '[0,0,0]');
  },
  
  // Set best scores for chamber parts
  setPartBests(chamber, bests) {
    const key = this.BEST_KEYS[chamber];
    if (!key) return;
    localStorage.setItem(key, JSON.stringify(bests));
  },
  
  // Set attempts for a specific chamber part  
  setPartAttempts(chamber, partIndex, attempts) {
    const key = this.ATTEMPT_KEYS[chamber];
    if (!key) return;
    const allAttempts = JSON.parse(localStorage.getItem(key) || '[0,0,0]');
    allAttempts[partIndex - 1] = attempts;
    localStorage.setItem(key, JSON.stringify(allAttempts));
  },
  
  // Award points for completing a chamber part (called when part is solved)
  completePart(chamber, partIndex) {
    if (!this.CHAMBER_KEYS[chamber] || partIndex < 1 || partIndex > 3) return 0;
    
    // Get current attempts for this part
    const currentAttempts = this.getPartAttempts(chamber, partIndex);
    
    // Calculate points based on attempts (2 for first try, 1 for second, 0 for third+)
    const pointsEarned = currentAttempts === 0 ? 2 : currentAttempts === 1 ? 1 : 0;
    
    // Only award points if we haven't already completed this part
    if (pointsEarned > 0) {
      const currentChamberPoints = this.getChamberPoints(chamber);
      const newChamberPoints = Math.min(currentChamberPoints + pointsEarned, 6); // Cap at 6 per chamber
      
      // Update chamber-specific points
      localStorage.setItem(this.CHAMBER_KEYS[chamber], newChamberPoints);
      
      // Recalculate total
      this.recalculateTotal();
      
      console.log(`🎯 Completed ${chamber} part ${partIndex} with ${currentAttempts} attempts. Earned ${pointsEarned} points. Chamber total: ${newChamberPoints}, Global total: ${this.getTotal()}`);
    }
    
    return pointsEarned;
  },
  
  // Record a failed attempt for a chamber part
  recordAttempt(chamber, partIndex) {
    if (!this.ATTEMPT_KEYS[chamber] || partIndex < 1 || partIndex > 3) return;
    
    const currentAttempts = this.getPartAttempts(chamber, partIndex);
    this.setPartAttempts(chamber, partIndex, currentAttempts + 1);
    
    console.log(`🔄 Recorded attempt ${currentAttempts + 1} for ${chamber} part ${partIndex}`);
  },
  
  // NEW: Report part completion with session-based scoring (allows improvement)
  reportPartResult(chamber, partIndex, sessionPoints) {
    if (!this.BEST_KEYS[chamber] || partIndex < 1 || partIndex > 3) return 0;
    if (sessionPoints < 0 || sessionPoints > 2) return 0; // Validate 0-2 points
    
    // Ensure best scores are initialized
    this.initializeBestScores(chamber);
    
    const bests = this.getPartBests(chamber);
    const currentBest = bests[partIndex - 1];
    
    // Only award improvement delta
    if (sessionPoints > currentBest) {
      const improvement = sessionPoints - currentBest;
      bests[partIndex - 1] = sessionPoints;
      this.setPartBests(chamber, bests);
      
      // Update chamber total (with 6-point cap)
      const currentChamberPoints = this.getChamberPoints(chamber);
      const newChamberPoints = Math.min(currentChamberPoints + improvement, 6);
      localStorage.setItem(this.CHAMBER_KEYS[chamber], newChamberPoints);
      
      // Recalculate global total
      this.recalculateTotal();
      
      console.log(`🏆 ${chamber} part ${partIndex}: improved from ${currentBest} to ${sessionPoints} points (+${improvement}). Chamber total: ${newChamberPoints}, Global total: ${this.getTotal()}`);
      return improvement;
    } else {
      console.log(`📊 ${chamber} part ${partIndex}: scored ${sessionPoints}, but best is ${currentBest}. No improvement.`);
      return 0;
    }
  },
  
  // Initialize best scores based on existing chamber points (migration helper)
  initializeBestScores(chamber) {
    const bestKey = this.BEST_KEYS[chamber];
    if (!bestKey || localStorage.getItem(bestKey)) return; // Already initialized
    
    const existingPoints = this.getChamberPoints(chamber);
    
    // Seed best scores to match existing points
    // Distribute points from right to left (part 3, 2, 1) prioritizing 2-point scores
    let remaining = existingPoints;
    const bests = [0, 0, 0];
    
    // Fill from part 3 to part 1, giving 2 points each until we run out
    for (let i = 2; i >= 0 && remaining > 0; i--) {
      const award = Math.min(2, remaining);
      bests[i] = award;
      remaining -= award;
    }
    
    this.setPartBests(chamber, bests);
    console.log(`🔄 Initialized ${chamber} best scores: [${bests.join(', ')}] (total: ${existingPoints})`);
  },
  
  // Recalculate total from all chamber scores
  recalculateTotal() {
    const total = Object.keys(this.CHAMBER_KEYS).reduce((sum, chamber) => {
      return sum + this.getChamberPoints(chamber);
    }, 0);
    
    localStorage.setItem(this.TOTAL_KEY, total);
    return total;
  },
  
  // Reset all points (for testing/development)
  reset() {
    localStorage.removeItem(this.TOTAL_KEY);
    Object.values(this.CHAMBER_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    Object.values(this.ATTEMPT_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    Object.values(this.BEST_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    console.log('🔄 Global points system reset');
  },
  
  // Check if Forge should be unlocked
  canUnlockForge() {
    const total = this.getTotal();
    const required = 12;
    return total >= required;
  },
  
  // Get progress toward Forge unlock
  getForgeProgress() {
    const total = this.getTotal();
    const required = 12;
    const maxPossible = 24;
    
    return {
      current: total,
      required: required,
      maxPossible: maxPossible,
      percentage: Math.round((total / required) * 100),
      unlocked: total >= required,
      remaining: Math.max(0, required - total)
    };
  },
  
  // Get detailed breakdown by chamber
  getDetailedBreakdown() {
    return {
      total: this.getTotal(),
      chambers: {
        refrax: this.getChamberPoints('refrax'),
        magnetica: this.getChamberPoints('magnetica'),
        chrona: this.getChamberPoints('chrona'),
        violetflicker: this.getChamberPoints('violetflicker')
      },
      forgeProgress: this.getForgeProgress()
    };
  },

  // ========== NEW PER-PART SCORING AND RETRY LOGIC ==========
  
  /**
   * Update per-part score for a chamber using attempt-based logic
   * @param {string} chamber - chamber ID (refrax, magnetica, etc.)
   * @param {number} partIndex - 1,2,3 for the part
   * @param {number} attemptNumber - 1,2,3 (first, second, third try)
   */
  updatePartScore(chamber, partIndex, attemptNumber) {
    if (!this.BEST_KEYS[chamber] || partIndex < 1 || partIndex > 3) return 0;
    
    // Ensure best scores are initialized
    this.initializeBestScores(chamber);
    
    const bests = this.getPartBests(chamber);
    const previousBest = bests[partIndex - 1] || 0;

    // Calculate points for this attempt using 2/1/0 logic
    let pointsThisAttempt = 0;
    if (attemptNumber === 1) pointsThisAttempt = 2;
    else if (attemptNumber === 2) pointsThisAttempt = 1;
    else pointsThisAttempt = 0;

    // Only update if this attempt is better than previous best
    if (pointsThisAttempt > previousBest) {
      const improvement = pointsThisAttempt - previousBest;
      bests[partIndex - 1] = pointsThisAttempt;
      this.setPartBests(chamber, bests);
      
      // Update chamber total (with 6-point cap)
      const currentChamberPoints = this.getChamberPoints(chamber);
      const newChamberPoints = Math.min(currentChamberPoints + improvement, 6);
      localStorage.setItem(this.CHAMBER_KEYS[chamber], newChamberPoints);
      
      // Recalculate global total
      this.recalculateTotal();
      
      console.log(`🎯 ${chamber} part ${partIndex}: improved from ${previousBest} to ${pointsThisAttempt} points (+${improvement}). Chamber total: ${newChamberPoints}, Global total: ${this.getTotal()}`);
      return improvement;
    }
    
    return 0;
  },

  /**
   * Track player attempts for each part and return current attempt number
   * @param {string} chamber - chamber ID
   * @param {number} partIndex - 1,2,3
   */
  getAttemptNumber(chamber, partIndex) {
    if (!this.ATTEMPT_KEYS[chamber] || partIndex < 1 || partIndex > 3) return 1;
    
    const currentAttempts = this.getPartAttempts(chamber, partIndex);
    const newAttemptNumber = currentAttempts + 1;
    this.setPartAttempts(chamber, partIndex, newAttemptNumber);
    
    return newAttemptNumber;
  },

  /**
   * Retry a chamber part - combines attempt tracking and scoring
   * @param {string} chamber
   * @param {number} partIndex
   * @param {number} attemptNumber
   */
  retryPart(chamber, partIndex, attemptNumber) {
    const improvement = this.updatePartScore(chamber, partIndex, attemptNumber);

    // Check if Forge should unlock
    this.checkForgeUnlock();

    // Update progress display if function exists
    if (typeof this.updateProgressDisplay === 'function') {
      this.updateProgressDisplay();
    }

    return improvement;
  },

  /**
   * Call this when a part is completed (correctly)
   * @param {string} chamber
   * @param {number} partIndex
   */
  onPartComplete(chamber, partIndex) {
    const attemptNumber = this.getAttemptNumber(chamber, partIndex);

    // Update the per-part score using retry logic
    const improvement = this.retryPart(chamber, partIndex, attemptNumber);

    console.log(`🏆 Part ${partIndex} of ${chamber} completed on attempt ${attemptNumber} (+${improvement} points)`);
    
    return { attemptNumber, improvement };
  },

  /**
   * Check if Forge should unlock and trigger unlock if needed
   * @returns {boolean} - true if unlocked
   */
  checkForgeUnlock() {
    const totalPoints = this.getTotal();
    const requiredPoints = 12;

    if (totalPoints >= requiredPoints) {
      this.unlockForge();
      return true;
    }
    return false;
  },

  /**
   * Unlock Forge UI
   */
  unlockForge() {
    const forgeStatus = document.getElementById('forgeStatus');
    if (forgeStatus) {
      forgeStatus.textContent = 'Forge unlocked! You can now create Qbits and assign them to fix slots.';
    }
    
    // Trigger custom event for other systems to listen for
    const event = new CustomEvent('forgeUnlocked', { 
      detail: { totalPoints: this.getTotal() } 
    });
    document.dispatchEvent(event);
    
    console.log('🔥 Forge has been unlocked!');
  },

  /**
   * Update the completion/progress UI
   */
  updateProgressDisplay() {
    const totalPoints = this.getTotal();
    const chambers = ['refrax','magnetica','chrona','violetflicker'];
    const completedChambers = chambers.filter(chamber => this.getChamberPoints(chamber) > 0).length;
    
    // Update completion status if element exists
    const completionEl = document.getElementById('completionStatus');
    if (completionEl) {
      completionEl.textContent = `${completedChambers} of 4 Qbit chambers restored (${totalPoints} points)`;
    }

    // Update Forge status if element exists
    const forgeStatus = document.getElementById('forgeStatus');
    if (forgeStatus) {
      if (totalPoints < 12) {
        forgeStatus.textContent = `${totalPoints}/24 — Forge unlocks at 12`;
      } else {
        forgeStatus.textContent = `${totalPoints}/24 — Forge unlocked`;
      }
    }
  },

  /**
   * Reset attempt counts and points (e.g., when starting new player or full reset)
   */
  resetAttempts() {
    const chambers = ['refrax','magnetica','chrona','violetflicker'];
    
    // Reset attempts and best scores
    chambers.forEach(chamber => {
      if (this.ATTEMPT_KEYS[chamber]) {
        localStorage.setItem(this.ATTEMPT_KEYS[chamber], JSON.stringify([0,0,0]));
      }
      if (this.BEST_KEYS[chamber]) {
        localStorage.setItem(this.BEST_KEYS[chamber], JSON.stringify([0,0,0]));
      }
      if (this.CHAMBER_KEYS[chamber]) {
        localStorage.setItem(this.CHAMBER_KEYS[chamber], 0);
      }
    });
    
    // Reset total
    localStorage.setItem(this.TOTAL_KEY, 0);
    
    this.updateProgressDisplay();
    console.log('🔄 All attempts and scores reset');
  }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  GlobalPoints.recalculateTotal();
});

// Make available globally
window.GlobalPoints = GlobalPoints;

// Compatibility alias for getChamberTotal -> getChamberPoints
if (window.GlobalPoints && !GlobalPoints.getChamberTotal && GlobalPoints.getChamberPoints) {
  console.warn('[compat] getChamberTotal → getChamberPoints');
  GlobalPoints.getChamberTotal = GlobalPoints.getChamberPoints.bind(GlobalPoints);
}