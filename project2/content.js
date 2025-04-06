// content.js (Updated to intercept M3U8 URLs more aggressively)

// Function to detect M3U8 URLs
function isM3u8Url(url) {
    try {
      const urlObj = new URL(url);
      return (
        urlObj.pathname.toLowerCase().endsWith('.m3u8') ||
        urlObj.pathname.toLowerCase().includes('.m3u8/') ||
        urlObj.pathname.toLowerCase().includes('/.m3u8') ||
        (urlObj.pathname.toLowerCase().match(/\.m3u8[?#]/) !== null) ||
        urlObj.search.toLowerCase().includes('format=m3u8') ||
        urlObj.hash.toLowerCase().includes('format=m3u8')
      );
    } catch (e) {
      return false; // Invalid URL
    }
  }
  
  // Function to initialize the player (mostly same as before)
  function initializeM3u8Player(m3u8Src) {
      console.log("Initializing HLS player for:", m3u8Src);
  
      // --- 1. Clear the page ---
      // Clear body (should exist by DOMContentLoaded)
      if (!document.body) {
          console.error("Document body not found during initialization!");
          return; // Should not happen if called after DOMContentLoaded
      }
      document.body.innerHTML = '';
      document.body.style.margin = '0';
      document.body.style.backgroundColor = '#000';
      document.body.style.display = 'flex';
      document.body.style.justifyContent = 'center';
      document.body.style.alignItems = 'center';
      document.body.style.height = '100vh';
      document.body.style.overflow = 'hidden';
  
      // Clear head and add basic styles/title (head should exist)
      if (!document.head) {
          console.error("Document head not found during initialization!");
          return;
      }
      document.head.innerHTML = '';
      const title = document.createElement('title');
      title.textContent = 'HLS Player';
      document.head.appendChild(title);
      const style = document.createElement('style');
      style.textContent = `
          video { width: 100%; height: 100%; max-width: 100%; max-height: 100%; display: block; }
          body { margin: 0; background-color: #000; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
      `;
      document.head.appendChild(style);
  
      // --- 2. Create video element ---
      const videoElement = document.createElement('video');
      videoElement.id = 'hlsVideoPlayerInjected';
      videoElement.controls = true;
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      document.body.appendChild(videoElement); // Append to the now-cleared body
  
      // --- 3. Inject hls.min.js script ---
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('hls.min.js');
      console.log("Injecting hls.js from:", script.src);
  
      // --- 4. Wait for hls.js to load, then initialize ---
      script.onload = () => {
          console.log("hls.min.js loaded successfully.");
  
          if (typeof Hls === 'undefined') {
               console.error("Hls object not found after loading script!");
               document.body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Error: Failed to load HLS playback library.</p>';
               return;
          }
  
          // HLS Initialization and Event Listeners
          if (Hls.isSupported()) {
              console.log("HLS.js is supported. Initializing...");
              const hls = new Hls({ debug: false });
              hls.loadSource(m3u8Src);
              hls.attachMedia(videoElement);
  
              hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
                  console.log("Manifest parsed, levels available:", data.levels);
                  // Handle relative URLs in the playlist if needed
                  videoElement.play().catch(e => console.warn("Autoplay failed:", e));
                  chrome.runtime.sendMessage({ type: "HLS_MANIFEST_DATA", payload: { url: m3u8Src, levels: data.levels.map(l => ({ height: l.height, bitrate: l.bitrate })), } }).catch(e => console.warn("CS: Failed msg send:", e));
              });
              hls.on(Hls.Events.LEVEL_SWITCHED, function (event, data) {
                   const currentLevel = hls.levels[data.level];
                   console.log('Switched to level:', currentLevel);
                   chrome.runtime.sendMessage({ type: "HLS_LEVEL_SWITCH", payload: { height: currentLevel.height, bitrate: currentLevel.bitrate } }).catch(e => console.warn("CS: Failed msg send:", e));
              });
              hls.on(Hls.Events.ERROR, function (event, data) {
                  console.error('HLS Error:', data);
                   chrome.runtime.sendMessage({ type: "HLS_ERROR", payload: { type: data.type, details: data.details, fatal: data.fatal, url: data.url } }).catch(e => console.warn("CS: Failed msg send:", e));
                  if (data.fatal) { hls.destroy(); }
              });
  
          } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
              console.log("HLS.js not supported, trying native HLS.");
              videoElement.src = m3u8Src;
              videoElement.addEventListener('loadedmetadata', () => { videoElement.play().catch(e => console.warn("Autoplay failed:", e)); });
              chrome.runtime.sendMessage({ type: "NATIVE_HLS_PLAYBACK", payload: { url: m3u8Src } }).catch(e => console.warn("CS: Failed msg send:", e));
          } else {
               console.error("HLS is not supported in this browser.");
               document.body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Error: HLS playback is not supported.</p>';
               chrome.runtime.sendMessage({ type: "HLS_NOT_SUPPORTED", payload: { url: m3u8Src } }).catch(e => console.warn("CS: Failed msg send:", e));
          }
      };
  
      script.onerror = () => {
          console.error("Failed to load hls.min.js script!");
           document.body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Error: Failed to load HLS playback library.</p>';
      };
  
      document.head.appendChild(script); // Append to head
  }
  
  // --- Super-Early Interception ---
  // Execute immediately when the script runs
  (function() {
      // Check the URL immediately
      const currentUrl = window.location.href;
      
      if (isM3u8Url(currentUrl)) {
          console.log("Detected M3U8 URL at script execution:", currentUrl);
          
          // Stop the page from loading further by removing all content
          if (document.documentElement) {
              document.documentElement.innerHTML = '<html><head></head><body style="background-color: #000;"><div style="color: white; text-align: center; margin-top: 20px;">Initializing HLS Player...</div></body></html>';
          }
          
          // Initialize player right away if possible
          if (document.body) {
              initializeM3u8Player(currentUrl);
          } else {
              // Wait for DOMContentLoaded if body isn't ready yet
              document.addEventListener('DOMContentLoaded', () => {
                  initializeM3u8Player(currentUrl);
              });
          }
      }
  })();
  
  // --- Main Execution Logic (backup) ---
  // Ensure we are in the top-level frame
  if (window.self === window.top) {
      // Check if the URL ends with .m3u8
      const currentUrl = window.location.href;
      
      if (isM3u8Url(currentUrl)) {
          console.log("Content script running for M3U8 URL:", currentUrl);
          
          // Backup approach: Wait for DOM before manipulating it
          if (document.readyState === 'loading') {
              // If DOM hasn't loaded yet, wait for the event
              document.addEventListener('DOMContentLoaded', () => {
                   console.log("DOMContentLoaded fired, initializing player...");
                   // Check if player already injected (e.g., listener fired twice?)
                   if (!document.getElementById('hlsVideoPlayerInjected')) {
                      initializeM3u8Player(currentUrl);
                   }
              });
          } else {
              // If DOM is already interactive or complete, run immediately
               console.log("DOM already loaded, initializing player...");
               if (!document.getElementById('hlsVideoPlayerInjected')) {
                   initializeM3u8Player(currentUrl);
               }
          }
      }
  }