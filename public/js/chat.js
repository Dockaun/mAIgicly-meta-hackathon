// © 2026 mAIgicly. All rights reserved. Proprietary software.
// Unauthorized copying, modification, or distribution is prohibited.
// Chat interface for quantum companions
class QbitChat {
  constructor() {
    this.currentQbit = this.getQbitFromURL();
    this.stage = 'afterVideo';
    this.messages = [];
    
    this.initializeUI();
    this.setupEventListeners();
    this.sendInitialGreeting();
  }
  
  getQbitFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('qbit') || 'refrax';
  }
  
  initializeUI() {
    const qbitInfo = this.getQbitInfo(this.currentQbit);
    
    // Set qbit-specific styling
    document.getElementById('chatBody').className = this.currentQbit;
    
    // Update header info
    document.getElementById('qbitName').textContent = qbitInfo.name;
    document.getElementById('qbitDescription').textContent = qbitInfo.description;
    document.getElementById('qbitAvatar').textContent = qbitInfo.elements;
    
    // Update chat input placeholder with qbit name
    document.getElementById('chatInput').placeholder = `What do you want to know?`;
    
    // Load MP4 video for the center display only
    this.loadQbitVideo();
    
    // Chamber link removed - automatic transition after conversation
  }

  loadQbitVideo() {
    // Load only the large center video
    const mainVideoSource = document.getElementById('mainVideoSource');
    const mainQbitVideo = document.getElementById('mainQbitVideo');
    
    // Map qbit names to MP4 file names (accounting for file naming variations)
    const videoFiles = {
      refrax: '/assets/mp4s/Refrax.mp4',
      magnetica: '/assets/mp4s/Magentica.mp4', // Note: your file is named "Magentica.mp4"
      chrona: '/assets/mp4s/chrona.mp4',
      violetflicker: '/assets/mp4s/Violet Flame.mp4'
    };
    
    const videoPath = videoFiles[this.currentQbit];
    
    if (videoPath) {
      // Ensure video is unmuted and volume is set
      mainQbitVideo.muted = false;
      mainQbitVideo.volume = 0.8;
      
      // Load main center video
      mainVideoSource.src = videoPath;
      mainQbitVideo.load();
      
      mainQbitVideo.addEventListener('loadeddata', () => {
        console.log('Main Qbit video loaded successfully');
        
        // Try to play with audio - handle autoplay policy
        mainQbitVideo.play().then(() => {
          console.log('✅ Video playing with audio');
        }).catch(err => {
          console.log('⚠️ Autoplay blocked, enabling on user interaction:', err);
          // If autoplay fails, unmute on first user interaction
          document.body.addEventListener('click', () => {
            mainQbitVideo.muted = false;
            mainQbitVideo.play();
          }, { once: true });
        });
      });
    }
  }
  
  getQbitInfo(qbit) {
    const qbitData = {
      refrax: {
        name: 'Refrax',
        description: 'The Light Weaver',
        elements: 'Si/B',
        chamber: '/chambers/refrax.html'
      },
      magnetica: {
        name: 'Magnetica', 
        description: 'The Field Shaper',
        elements: 'Ni/Co',
        chamber: '/chambers/magnetica.html'
      },
      chrona: {
        name: 'Chrona',
        description: 'The Time Keeper', 
        elements: 'Rb/Cs',
        chamber: '/chambers/chrona.html'
      },
      violetflicker: {
        name: 'Violet Flicker',
        description: 'The Signal Hunter',
        elements: 'Kr/Xe',
        chamber: '/chambers/violetflicker.html'
      }
    };
    
    return qbitData[qbit] || qbitData.refrax;
  }
  
  setupEventListeners() {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const skipBtn = document.getElementById('skipToChamberBtn');
    
    // Send message on button click
    sendBtn.addEventListener('click', () => this.sendMessage());
    
    // Send message on Enter key
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    
    // Skip to chamber button
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        const qbitInfo = this.getQbitInfo(this.currentQbit);
        if (window.MaigiclyAnalytics) {
          window.MaigiclyAnalytics.track({
            event_name: 'skip_to_chamber',
            properties: { qbit_id: this.currentQbit, qbit_name: qbitInfo.name }
          });
        }
        window.location.href = `/chambers/${this.currentQbit}.html`;
      });
    }
    
    // Clear placeholder when user starts typing
    chatInput.addEventListener('focus', () => {
      if (chatInput.value === '') {
        chatInput.placeholder = `What do you want to know?`;
      }
    });
    
    // Don't auto-focus so placeholder is visible
    // chatInput.focus();
  }
  
  async sendInitialGreeting() {
    const chatInput = document.getElementById('chatInput');
    if (!chatInput) return;
    
    chatInput.placeholder = '⌛ Tuning...';
    
    // Send the afterVideo stage message to get the initial greeting
    try {
      const response = await this.sendToServer('', 'afterVideo');
      if (response.reply) {
        chatInput.placeholder = response.reply;
        // Update stage from server response
        if (response.stage) {
          this.stage = response.stage;
        } else {
          this.stage = '1'; // Fallback if no stage provided
        }
      }
    } catch (error) {
      console.error('Error getting initial greeting:', error);
      chatInput.placeholder = `What do you want to know?`;
      this.stage = '1';
    }
  }
  
  async sendMessage() {
    const chatInput = document.getElementById('chatInput');
    const message = chatInput.value.trim();
    
    if (!message) return;
    
    // Clear input and disable send button
    chatInput.value = '';
    this.toggleSendButton(false);
    
    // Show loading in placeholder
    chatInput.placeholder = '⌛ Qbit is tuning in...';
    
    try {
      // Send to server
      const response = await this.sendToServer(message, this.stage);
      
      // Update placeholder with AI response
      if (response.reply) {
        chatInput.placeholder = response.reply;
        
        // Update stage if provided
        if (response.stage) {
          console.log(`Stage updated: ${this.stage} -> ${response.stage}`);
          this.stage = response.stage;
        }
        
        // Check if we should advance to chamber after 3rd turn
        if (this.stage === 'chamber' || response.stage === 'chamber' || response.reply.includes('chamber')) {
          // Give user time to read the response, then transition to chamber
          setTimeout(() => {
            window.location.href = `/chambers/${this.currentQbit}.html`;
          }, 3000);
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      chatInput.placeholder = 'There was an error. Please try again.';
    }
    
    // Re-enable send button
    this.toggleSendButton(true);
  }
  
  async sendToServer(message, stage) {
    const response = await fetch('/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message,
        qbit: this.currentQbit,
        stage: stage
      })
    });
    
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    
    return response.json();
  }
  
  addMessage(type, content) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageEl = document.createElement('div');
    messageEl.className = `message ${type}`;
    messageEl.textContent = content;
    
    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  showTyping() {
    const messagesContainer = document.getElementById('chatMessages');
    const typingEl = document.createElement('div');
    typingEl.className = 'typing';
    typingEl.id = 'typingIndicator';
    
    const dotsEl = document.createElement('div');
    dotsEl.className = 'typing-dots';
    dotsEl.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    
    typingEl.appendChild(dotsEl);
    messagesContainer.appendChild(typingEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  hideTyping() {
    const typingEl = document.getElementById('typingIndicator');
    if (typingEl) {
      typingEl.remove();
    }
  }
  
  toggleSendButton(enabled) {
    const sendBtn = document.getElementById('sendBtn');
    sendBtn.disabled = !enabled;
  }
  
  showChamberTransition() {
    // Chamber transition now happens automatically after 3rd turn
    // No button highlighting needed since navigation was removed
  }
}

// Initialize chat when page loads
document.addEventListener('DOMContentLoaded', () => {
  new QbitChat();
});