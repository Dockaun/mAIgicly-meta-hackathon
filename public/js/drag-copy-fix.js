// /js/drag-copy-fix.js
// Unified Drag → Tap copy fix + one-time Forge mobile tooltip
// Safe for dynamic content, skips script/style nodes, no globals
 
(function () {
 
  function applyDragCopyFix() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!isTouch) return;
 
    // === DRAG → TAP REPLACEMENTS ===
    const replacements = [
      { from: /Drag the mods into sequence/gi, to: "Tap the mods into sequence" },
      { from: /Drag the mods into position/gi, to: "Tap the mods into position" },
      { from: /Drag .*? into position/gi,      to: "Tap the components into position" },
      { from: /Drag the (right|correct) mods/gi, to: "Tap the right mods" },
      { from: /Drag and drop/gi,               to: "Tap to place" },
      { from: /Drag the components/gi,         to: "Tap the components" },
      { from: /^Drag /gim,                     to: "Tap " }
    ];
 
    // Safe tree walker - skip code elements
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          const parent = node.parentNode;
          if (!parent) return NodeFilter.FILTER_ACCEPT;
          const tag = parent.tagName || '';
          if (['SCRIPT','STYLE','NOSCRIPT','TEXTAREA','INPUT'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
 
    let node;
    while ((node = walker.nextNode())) {
      let text = node.textContent;
      let changed = false;
 
      replacements.forEach(r => {
        const newText = text.replace(r.from, r.to);
        if (newText !== text) {
          text = newText;
          changed = true;
        }
      });
 
      if (changed) {
        node.textContent = text;
      }
    }
 
    // Also fix attributes
    document.querySelectorAll('[data-tip], [aria-label], [title]').forEach(el => {
      ['data-tip', 'aria-label', 'title'].forEach(attr => {
        if (el.hasAttribute(attr)) {
          let val = el.getAttribute(attr);
          let newVal = val;
          replacements.forEach(r => {
            newVal = newVal.replace(r.from, r.to);
          });
          if (newVal !== val) el.setAttribute(attr, newVal);
        }
      });
    });
  }
 
  // Run immediately + delayed second pass for dynamic content
  applyDragCopyFix();
  setTimeout(applyDragCopyFix, 1200);
 
  // === ONE-TIME FORGE MOBILE TOOLTIP (Forge only, mobile only) ===
  if (window.innerWidth <= 768 &&
      (window.location.pathname.includes('/forge') ||
       document.title.toLowerCase().includes('forge')) &&
      localStorage.getItem('forgeMobileTipShown') !== 'true') {
 
    setTimeout(() => {
      const tooltip = document.createElement('div');
      tooltip.style.cssText = `
        position:fixed; top:80px; left:50%; transform:translateX(-50%);
        background:#1e2937; color:#e0f2fe; border:2px solid #67e8f9;
        padding:14px 20px; border-radius:12px; font-size:15px; z-index:9999;
        box-shadow:0 10px 30px rgba(0,0,0,0.6); max-width:280px; text-align:center;
        line-height:1.4;
      `;
      tooltip.innerHTML = `
        📱 <strong>On mobile:</strong><br>
        Tap a mod, then tap a slot to place it.<br>
        <small style="opacity:0.8">Tip shown only once</small>
      `;
 
      document.body.appendChild(tooltip);
 
      setTimeout(() => {
        tooltip.style.transition = 'opacity 0.6s';
        tooltip.style.opacity = '0';
        setTimeout(() => tooltip.remove(), 700);
      }, 6500);
 
      localStorage.setItem('forgeMobileTipShown', 'true');
    }, 1000);
  }
 
})();
