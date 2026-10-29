// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
/**
 * Chamber Completion Helper
 * 
 * Bulletproof chamber completion flow with:
 * - Analytics tracking wrapped in try/catch (never blocks gameplay)
 * - 9s failsafe timer ensures redirect ALWAYS happens
 * - Idempotent redirect (prevents double navigation)
 * - Star rating widget integration with graceful fallback
 */

(function() {
  'use strict';

  window.ChamberCompletion = {
    /**
     * Handle chamber completion with analytics, rating widget, and guaranteed redirect
     * 
     * @param {Object} options
     * @param {string} options.qbit - Qbit name (e.g., 'refrax')
     * @param {string} options.chamber - Chamber identifier (e.g., 'refrax_chamber')
     * @param {function} options.getPoints - Function that returns total points for this chamber
     * @param {function} options.redirect - Function to execute for navigation
     * @param {string} [options.ratingTitle] - Title for rating widget
     * @param {string} [options.ratingSubtitle] - Subtitle for rating widget
     */
    trackCompletion(options) {
      const {
        qbit,
        chamber,
        getPoints,
        redirect,
        ratingTitle = `How was the ${qbit} chamber?`,
        ratingSubtitle = 'Rate your experience'
      } = options;

      let redirected = false;
      let failsafeTimer = null;

      // Safe redirect wrapper (idempotent)
      const safeRedirect = () => {
        if (redirected) {
          console.log('⚠️ Redirect already executed, skipping duplicate');
          return;
        }
        redirected = true;
        
        // Cancel failsafe timer if still pending
        if (failsafeTimer) {
          clearTimeout(failsafeTimer);
          failsafeTimer = null;
          console.log('✅ Normal redirect - failsafe cancelled');
        }
        
        redirect();
      };

      // Track analytics (wrapped in try/catch - NEVER blocks gameplay)
      try {
        if (window.MaigiclyAnalytics && typeof getPoints === 'function') {
          const totalPoints = getPoints();
          window.MaigiclyAnalytics.track({
            event_name: 'chamber_complete',
            qbit: qbit,
            chamber: chamber,
            value_num: totalPoints
          });
          console.log(`📊 Tracked completion: ${chamber} (${totalPoints} points)`);
        }
      } catch (e) {
        console.warn('⚠️ Analytics tracking failed (non-critical):', e);
      }

      // Failsafe timer: ALWAYS redirect after 9s (even if rating widget breaks)
      failsafeTimer = setTimeout(() => {
        if (!redirected) {
          console.warn('⏰ Failsafe redirect triggered (9s elapsed)');
          safeRedirect();
        }
      }, 9000);

      // Show rating widget after 3s delay
      setTimeout(() => {
        if (window.StarRating) {
          window.StarRating.show({
            feature: chamber,
            title: ratingTitle,
            subtitle: ratingSubtitle,
            allowText: true,
            onComplete: safeRedirect,
            onSkip: safeRedirect
          });
        } else {
          // Rating widget not loaded - redirect immediately
          console.warn('⚠️ StarRating widget not available, redirecting now');
          safeRedirect();
        }
      }, 3000);
    }
  };

  console.log('✅ ChamberCompletion helper loaded');
})();
