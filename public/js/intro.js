// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
// Intro typewriter effect
const introTexts = [
  "You didn't land here by accident.",
  "Something ancient is stirring deep underground.",
  "It pulled you here — specifically you.",
  "Four Guardians have gone dark.",
  "And they just grabbed the first sleeve they could find."
];

let textIndex = 0;
let charIndex = 0;
let isDeleting = false;
let typingSpeed = 50;

function typeWriter() {
  const introTextEl = document.getElementById('introText');
  const currentText = introTexts[textIndex];
  
  if (!isDeleting) {
    // Typing
    introTextEl.textContent = currentText.substring(0, charIndex + 1);
    charIndex++;
    
    if (charIndex === currentText.length) {
      // Finished typing, wait before starting to delete
      if (textIndex === introTexts.length - 1) {
        // Last text, show the button
        setTimeout(() => {
          document.getElementById('beginBtn').style.display = 'block';
        }, 1000);
        return;
      }
      
      setTimeout(() => {
        isDeleting = true;
      }, 2000);
    }
  } else {
    // Deleting
    introTextEl.textContent = currentText.substring(0, charIndex - 1);
    charIndex--;
    
    if (charIndex === 0) {
      isDeleting = false;
      textIndex++;
      
      if (textIndex >= introTexts.length) {
        textIndex = 0;
      }
    }
  }
  
  const speed = isDeleting ? 30 : typingSpeed;
  setTimeout(typeWriter, speed);
}

// Start the typewriter effect when page loads
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(typeWriter, 500);
  
  // Begin button click handler - clears all data for fresh start
  document.getElementById('beginBtn').addEventListener('click', async () => {
    // Clear all game data for new player
    try {
      // Clear localStorage prefixes
      const prefixes = [
        'refrax.', 'magnetica.', 'chrona.', 'violetflicker.',
        'violet.', 'beano.', 'quantum.', 'forge.', 'resonance.',
        'engineeringLog.', 'chat.', 'transcript.'
      ];
      
      Object.keys(localStorage).forEach(key => {
        if (prefixes.some(prefix => key.startsWith(prefix))) {
          localStorage.removeItem(key);
        }
      });
      
      // Clear forged Qbits
      if (window.ForgedQbitsStore) {
        window.ForgedQbitsStore.clear();
      } else {
        localStorage.removeItem('forged-qbits.local');
      }
      
      // Clear specific keys
      const specificKeys = [
        'qbit-selection-voice-played', 'selectedQbit',
        'refrax.v3.complete', 'magnetica.v3.complete', 'chrona.v3.complete', 'violetflicker.v3.complete',
        'refrax.story', 'magnetica.story', 'chrona.story', 'violetflicker.story'
      ];
      specificKeys.forEach(key => localStorage.removeItem(key));
      
      // Clear sessionStorage
      sessionStorage.clear();
      
      console.log('✅ All data cleared - starting fresh adventure');
    } catch (error) {
      console.error('Error clearing data:', error);
    }
    
    // Mark intro as seen so future visits skip it
    localStorage.setItem('hasPlayedIntro', 'true');
    // Navigate to quantum machine
    window.location.href = '/resonance.html';
  });
});
