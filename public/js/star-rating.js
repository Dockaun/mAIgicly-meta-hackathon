// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
// Star Rating Widget for mAIgicly
// Reusable widget for collecting player feedback on game features
(function() {
  'use strict';
  
  // ========== GLOBAL DISABLE FLAG ==========
  // Set to true to disable all rating popups (for TikTok launch)
  const RATINGS_DISABLED = true;
  // ==========================================
  
  /**
   * Show a star rating widget for a specific feature
   * @param {object} options Configuration options
   * @param {string} options.feature - Feature identifier (e.g., 'forge', 'refrax_chamber')
   * @param {string} options.title - Title shown above stars
   * @param {string} options.subtitle - Subtitle text (optional)
   * @param {boolean} options.allowText - Show text feedback field (default: true)
   * @param {function} options.onComplete - Callback after successful submission
   * @param {function} options.onSkip - Callback if user skips (optional)
   */
  function showRatingWidget(options) {
    // Skip if ratings are disabled globally
    if (RATINGS_DISABLED) {
      if (options.onComplete) options.onComplete();
      return;
    }
    
    const {
      feature,
      title = 'How was your experience?',
      subtitle = '',
      allowText = true,
      onComplete,
      onSkip
    } = options;
    
    if (!feature) {
      console.error('StarRating: feature is required');
      return;
    }
    
    // Check if already rated this feature in this session
    const storageKey = `maigicly_rated_${feature}`;
    if (localStorage.getItem(storageKey)) {
      console.log(`StarRating: ${feature} already rated this session`);
      if (onComplete) onComplete();
      return;
    }
    
    // Create overlay
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
      z-index: 99999;
      pointer-events: auto;
      animation: fadeIn 0.3s ease-out;
    `;
    
    // Create modal
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: linear-gradient(180deg, #12121a, #0d0d15);
      border: 2px solid #2a2f45;
      border-radius: 16px;
      padding: 32px;
      max-width: 480px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(87, 211, 255, 0.1);
      text-align: center;
      pointer-events: auto;
      position: relative;
      z-index: 100000;
    `;
    
    // State
    let selectedRating = 0;
    
    // Build modal content
    modal.innerHTML = `
      <style>
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .rating-title {
          color: #57d3ff;
          font-size: 24px;
          font-weight: 600;
          margin: 0 0 8px 0;
        }
        .rating-subtitle {
          color: #9aa3b2;
          font-size: 14px;
          margin: 0 0 24px 0;
        }
        .stars-container {
          display: flex;
          gap: 12px;
          justify-content: center;
          margin: 24px 0;
        }
        .star {
          font-size: 48px;
          cursor: pointer;
          transition: all 0.2s ease;
          color: #2a2f45;
          text-shadow: 0 0 10px rgba(87, 211, 255, 0.3);
          user-select: none;
        }
        .star:hover,
        .star.active {
          color: #ffd700;
          text-shadow: 0 0 20px rgba(255, 215, 0, 0.6);
          transform: scale(1.2);
        }
        .feedback-field {
          margin: 24px 0;
        }
        .feedback-input {
          width: 100%;
          background: #1a1f34;
          border: 1px solid #2d3354;
          border-radius: 8px;
          padding: 12px;
          color: #eaf2ff;
          font-size: 14px;
          font-family: inherit;
          resize: vertical;
          min-height: 80px;
        }
        .feedback-input::placeholder {
          color: #6b7280;
        }
        .feedback-input:focus {
          outline: none;
          border-color: #57d3ff;
          box-shadow: 0 0 0 2px rgba(87, 211, 255, 0.1);
        }
        .button-row {
          display: flex;
          gap: 12px;
          justify-content: center;
          margin-top: 24px;
        }
        .rating-btn {
          background: #1a1f34;
          color: #eaf2ff;
          border: 1px solid #2d3354;
          border-radius: 10px;
          padding: 12px 24px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }
        .rating-btn:hover {
          background: #2a2f44;
          border-color: #7c9eff;
        }
        .rating-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .rating-btn.primary {
          background: rgba(87, 211, 255, 0.15);
          border-color: rgba(87, 211, 255, 0.4);
          color: #57d3ff;
        }
        .rating-btn.primary:hover:not(:disabled) {
          background: rgba(87, 211, 255, 0.25);
          border-color: rgba(87, 211, 255, 0.6);
        }
        .rating-message {
          color: #39d98a;
          font-size: 14px;
          margin-top: 16px;
          opacity: 0;
          transition: opacity 0.3s;
        }
        .rating-message.show {
          opacity: 1;
        }
      </style>
      
      <h3 class="rating-title">${title}</h3>
      ${subtitle ? `<p class="rating-subtitle">${subtitle}</p>` : ''}
      
      <div class="stars-container" id="starsContainer">
        <span class="star" data-rating="1">★</span>
        <span class="star" data-rating="2">★</span>
        <span class="star" data-rating="3">★</span>
        <span class="star" data-rating="4">★</span>
        <span class="star" data-rating="5">★</span>
      </div>
      
      ${allowText ? `
        <div class="feedback-field">
          <textarea 
            id="feedbackText" 
            class="feedback-input" 
            placeholder="Tell us more (optional)..."
            maxlength="500"
          ></textarea>
        </div>
      ` : ''}
      
      <div class="button-row">
        <button class="rating-btn" id="skipBtn">Skip</button>
        <button class="rating-btn primary" id="submitBtn" disabled>Submit Rating</button>
      </div>
      
      <div class="rating-message" id="message"></div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Get elements
    const stars = modal.querySelectorAll('.star');
    const submitBtn = modal.querySelector('#submitBtn');
    const skipBtn = modal.querySelector('#skipBtn');
    const feedbackInput = modal.querySelector('#feedbackText');
    const message = modal.querySelector('#message');
    
    // Star interaction handlers
    function updateStars(rating) {
      stars.forEach((star, index) => {
        if (index < rating) {
          star.classList.add('active');
        } else {
          star.classList.remove('active');
        }
      });
    }
    
    stars.forEach(star => {
      star.addEventListener('click', () => {
        selectedRating = parseInt(star.dataset.rating);
        updateStars(selectedRating);
        submitBtn.disabled = false;
      });
      
      star.addEventListener('mouseenter', () => {
        const rating = parseInt(star.dataset.rating);
        updateStars(rating);
      });
    });
    
    modal.querySelector('.stars-container').addEventListener('mouseleave', () => {
      updateStars(selectedRating);
    });
    
    // Submit handler
    async function submitRating() {
      if (selectedRating === 0) return;
      
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      
      try {
        // Get session ID from analytics (if available)
        const sessionId = window.MaigiclyAnalytics?.session_id || null;
        
        const payload = {
          feature,
          rating: selectedRating,
          notes: '',
          session_id: sessionId
        };
        
        if (allowText && feedbackInput && feedbackInput.value.trim()) {
          payload.notes = feedbackInput.value.trim();
        }
        
        const response = await fetch('/api/rate-feature', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (response.ok) {
          // Mark as rated in local storage
          localStorage.setItem(storageKey, 'true');
          
          // Track rating submission
          if (window.MaigiclyAnalytics) {
            window.MaigiclyAnalytics.track({
              event_name: 'rating_submitted',
              chamber: feature.includes('chamber') ? feature : null,
              value_num: selectedRating,
              properties: {
                feature: feature,
                notes_present: !!(allowText && feedbackInput && feedbackInput.value.trim())
              }
            });
          }
          
          // Show success message
          message.textContent = 'Thank you for your feedback!';
          message.classList.add('show');
          
          // Close after brief delay
          setTimeout(() => {
            closeWidget();
            if (onComplete) onComplete();
          }, 1500);
        } else {
          throw new Error('Failed to submit rating');
        }
      } catch (error) {
        console.error('Rating submission error:', error);
        message.style.color = '#ff6b6b';
        message.textContent = 'Failed to submit. Please try again.';
        message.classList.add('show');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Rating';
      }
    }
    
    function closeWidget() {
      document.body.removeChild(overlay);
    }
    
    // Button handlers
    submitBtn.addEventListener('click', submitRating);
    skipBtn.addEventListener('click', () => {
      localStorage.setItem(storageKey, 'skipped');
      closeWidget();
      if (onSkip) onSkip();
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeWidget();
        if (onSkip) onSkip();
      }
    });
    
    // Allow Enter key to submit if rating is selected
    if (feedbackInput) {
      feedbackInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey && selectedRating > 0) {
          submitRating();
        }
      });
    }
  }
  
  // Expose to global scope
  window.StarRating = {
    show: showRatingWidget
  };
  
  console.log('⭐ Star Rating Widget initialized');
})();
