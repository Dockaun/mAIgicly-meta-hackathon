// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
/**
 * ForgedQbitsStore - Client-side storage for forged Qbits
 * Supports multiplayer gallery with API backend and localStorage fallback
 * Uses architect_id for player identity and handles DB migration
 */
window.ForgedQbitsStore = {
  STORAGE_KEY: 'forged-qbits.local',
  MIGRATED_KEY: 'forged-qbits.migrated',
  MAX_ENTRIES: 50,
  API_BASE: '/api/forged-qbits',
  
  // Get architect ID (player's unique identifier)
  getArchitectId() {
    if (window.ArchitectID) {
      return window.ArchitectID.get();
    }
    // Fallback if architect-id.js not loaded
    const key = 'maigicly_architect_id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : 
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
      localStorage.setItem(key, id);
    }
    return id;
  },
  
  // Get player's alias from localStorage
  getAlias() {
    return localStorage.getItem('resonanceAlias') || null;
  },
  
  // Set player's alias
  setAlias(alias) {
    if (alias) {
      localStorage.setItem('resonanceAlias', alias);
    } else {
      localStorage.removeItem('resonanceAlias');
    }
  },
  
  /**
   * Get forged Qbits from API
   * @param {string} scope - 'continuum' (own) | 'network' (others) | 'all'
   * @param {string} sort - 'newest' | 'oldest' | 'trending'
   * @returns {Promise<Array>}
   */
  async getAll(scope = 'continuum', sort = 'newest') {
    const architectId = this.getArchitectId();
    
    try {
      const params = new URLSearchParams({
        architect_id: architectId,
        scope: scope,
        sort: sort
      });
      
      const response = await fetch(`${this.API_BASE}?${params}`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const qbits = await response.json();
      console.log(`[Store] Loaded ${qbits.length} Qbits from API (scope=${scope})`);
      return qbits;
    } catch (e) {
      console.warn('[Store] API unavailable, falling back to localStorage:', e.message);
      return scope === 'continuum' ? this.getFromLocalStorage() : [];
    }
  },
  
  /**
   * Get own Qbits (Continuum view)
   */
  async getMine() {
    return this.getAll('continuum');
  },
  
  /**
   * Get others' public Qbits (Network view)
   */
  async getNetwork(sort = 'newest') {
    return this.getAll('network', sort);
  },
  
  // Get Qbits from localStorage (fallback/cache)
  getFromLocalStorage() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (!data) return [];
      const qbits = JSON.parse(data);
      return Array.isArray(qbits) ? qbits : [];
    } catch (e) {
      console.error('[Store] Error reading from localStorage:', e);
      return [];
    }
  },
  
  // Sync method - get mine from localStorage for quick access
  getAllSync() {
    return this.getFromLocalStorage();
  },
  
  /**
   * Add/update a forged Qbit (uses upsert - one per mission)
   * @param {Object} qbit - Qbit data
   * @returns {Promise<Object>} - Saved Qbit with action ('created' or 'updated')
   */
  async add(qbit) {
    const architectId = this.getArchitectId();
    const alias = this.getAlias();
    
    const payload = {
      architect_id: architectId,
      name: qbit.name,
      alias: alias,
      mission_id: qbit.mission_id,
      role: qbit.role,
      look: qbit.look || {},
      parts: qbit.parts || [],
      fixes: qbit.fixes || [],
      boost: qbit.boost || '',
      emblem: qbit.emblem || {},
      recipe: qbit.recipe || {},
      story: qbit.story || '',
      mechanism: qbit.mechanism || qbit.story || '',
      image: qbit.image || null,
      timestamp: qbit.timestamp || Date.now(),
      visibility: qbit.visibility || 'public'
    };

    // Invent mode (hackathon step 7): a save made while an Invent challenge
    // is pending in sessionStorage is a Continuum response — always a new row,
    // never an update of the forged row for this mission.
    try {
      const raw = window.sessionStorage ? sessionStorage.getItem('continuum.inventChallenge') : null;
      if (raw) {
        const invent = JSON.parse(raw);
        if (invent && invent.id && invent.title) {
          payload.origin = 'continuum';
          payload.origin_challenge_title = String(invent.title).slice(0, 60);
        }
      }
    } catch (e) { /* storage unavailable: plain forged save */ }
    
    try {
      const response = await fetch(this.API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (response.status === 409) {
        // Alias conflict
        const error = await response.json();
        console.warn('[Store] Alias conflict:', error.message);
        return { error: 'ALIAS_CONFLICT', message: error.message };
      }
      
      if (response.status === 400) {
        // Bad request - could be profanity filter or validation error
        const error = await response.json();
        if (error.error === 'INVALID_NAME') {
          console.warn('[Store] Invalid name blocked:', error.message);
          return { error: 'INVALID_NAME', message: "That name isn't allowed. Try another one." };
        }
        throw new Error(`Validation error: ${error.message || error.error}`);
      }
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const savedQbit = await response.json();
      console.log(`[Store] ${savedQbit.action.toUpperCase()} Qbit: ${savedQbit.name} (mission: ${savedQbit.mission_id})`);
      
      // Update local cache
      this.updateLocalCache(savedQbit);
      
      return savedQbit;
    } catch (e) {
      console.warn('[Store] API unavailable, saving locally only:', e.message);
      // Fallback: save to localStorage
      const localQbit = { ...payload, id: Date.now() + '-' + Math.random().toString(36).slice(2) };
      this.saveToLocalStorage(localQbit);
      return { ...localQbit, action: 'local' };
    }
  },
  
  // Update local cache with server data (by mission_id for upsert compatibility)
  updateLocalCache(qbit) {
    try {
      let qbits = this.getFromLocalStorage();
      const existingIndex = qbits.findIndex(q => q.mission_id === qbit.mission_id);
      
      if (existingIndex >= 0) {
        qbits[existingIndex] = qbit;
      } else {
        qbits.unshift(qbit);
      }
      
      if (qbits.length > this.MAX_ENTRIES) {
        qbits.length = this.MAX_ENTRIES;
      }
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(qbits));
    } catch (e) {
      console.error('[Store] Error updating local cache:', e);
    }
  },
  
  // Save to localStorage (fallback)
  saveToLocalStorage(qbit) {
    try {
      let qbits = this.getFromLocalStorage();
      const existingIndex = qbits.findIndex(q => q.mission_id === qbit.mission_id);
      
      if (existingIndex >= 0) {
        qbits[existingIndex] = qbit;
      } else {
        qbits.unshift(qbit);
      }
      
      if (qbits.length > this.MAX_ENTRIES) {
        qbits.length = this.MAX_ENTRIES;
      }
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(qbits));
      console.log('[Store] Saved Qbit to localStorage:', qbit.name);
    } catch (e) {
      console.error('[Store] Error saving to localStorage:', e);
    }
  },
  
  /**
   * Migrate localStorage Qbits to database
   * Called on page load if API returns 0 Qbits but localStorage has data
   * @returns {Promise<Object>} - Migration result
   */
  async migrateLocalToDb() {
    // Check if already migrated
    if (localStorage.getItem(this.MIGRATED_KEY) === 'true') {
      console.log('[Store] Already migrated, skipping');
      return { status: 'skipped', reason: 'already_migrated' };
    }
    
    const localQbits = this.getFromLocalStorage();
    if (localQbits.length === 0) {
      console.log('[Store] No local Qbits to migrate');
      return { status: 'skipped', reason: 'no_local_data' };
    }
    
    // Check if API already has Qbits for this architect
    try {
      const existing = await this.getMine();
      if (existing.length > 0) {
        console.log('[Store] API already has Qbits, skipping migration');
        localStorage.setItem(this.MIGRATED_KEY, 'true');
        return { status: 'skipped', reason: 'api_has_data' };
      }
    } catch (e) {
      console.warn('[Store] Could not check API, skipping migration:', e.message);
      return { status: 'failed', reason: 'api_unavailable' };
    }
    
    console.log(`[Store] Migrating ${localQbits.length} Qbits from localStorage to API...`);
    
    const results = { migrated: 0, failed: 0, conflicts: [] };
    
    for (const qbit of localQbits) {
      try {
        const result = await this.add(qbit);
        if (result.error === 'ALIAS_CONFLICT') {
          results.conflicts.push({ qbit: qbit.name, message: result.message });
          results.failed++;
        } else if (result.error === 'INVALID_NAME') {
          results.conflicts.push({ qbit: qbit.name, message: 'Name not allowed' });
          results.failed++;
        } else {
          results.migrated++;
        }
      } catch (e) {
        console.error('[Store] Failed to migrate Qbit:', qbit.name, e);
        results.failed++;
      }
    }
    
    if (results.failed === 0) {
      // All migrated successfully - clear localStorage (keep architect_id)
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.setItem(this.MIGRATED_KEY, 'true');
      console.log(`[Store] Migration complete! ${results.migrated} Qbits synced to DB. LocalStorage cleared.`);
    } else {
      console.warn(`[Store] Migration partial: ${results.migrated} success, ${results.failed} failed`);
    }
    
    return { status: 'complete', ...results };
  },
  
  // Increment view count (for analytics)
  async incrementView(qbitId) {
    try {
      const response = await fetch(`${this.API_BASE}/${qbitId}/view`, {
        method: 'POST'
      });
      if (response.ok) {
        const result = await response.json();
        return result.viewCount;
      }
    } catch (e) {
      console.warn('[Store] Could not record view:', e.message);
    }
    return null;
  },
  
  // Clear localStorage cache (not DB)
  clearLocalCache() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      console.log('[Store] Cleared local cache');
      return true;
    } catch (e) {
      console.error('[Store] Error clearing cache:', e);
      return false;
    }
  },
  
  // Get count of locally cached Qbits
  countLocal() {
    return this.getFromLocalStorage().length;
  }
};
