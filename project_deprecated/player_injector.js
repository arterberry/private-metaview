// player_injector.js

(function() {
  // Prevent multiple injections if the script runs more than once (less likely now but good practice)
  if (window.hlsPlayerInjected) {
    console.log("HLS Player already injected, skipping.");
    return;
  }
  window.hlsPlayerInjected = true;
  console.log("Running HLS Player Injector (Content Script)...");

  // Since this runs at document_start, the DOM might not be fully ready.
  // We listen for DOMContentLoaded or just attempt immediate modification,
  // as we want to replace the page content ASAP. Immediate is often better here.

  // Let's try immediate modification first, as waiting for DOMContentLoaded
  // might still allow the browser to show the text content briefly.
  runPlayerInitialization();

  // --- Function Definitions ---

  function runPlayerInitialization() {
      // Clear the existing page content ASAP. Stop the browser from rendering text.
      // Using document.write can be effective here at document_start
      document.documentElement.innerHTML = '<head><title>HLS Player</title></head><body></body>';

      // Proceed with setting up the player UI and loading HLS.js
      try {
          const videoElement = setupPlayerUI();
          loadHlsJs(videoElement);
      } catch (error) {
          console.error("Error during player setup:", error);
          // Attempt to display error even if UI setup failed partially
          displayError(`Initialization Error: ${error.message || error}`);
      }
  }

  // --- Self-contained HTML and CSS ---
  function setupPlayerUI() {
    // Apply basic styles for full-page video
    const style = document.createElement('style');
    style.textContent = `
      html, body { margin: 0; padding: 0; background-color: #000; overflow: hidden; height: 100%; width: 100%; }
      #hlsVideoContainer {
        width: 100vw; /* Viewport width */
        height: 100vh; /* Viewport height */
        display: flex;
        justify-content: center;
        align-items: center;
        background-color: #000;
      }
      #hlsVideoPlayer {
        width: 100%;
        height: 100%;
        object-fit: contain; /* Or 'cover', 'fill' */
        display: block; /* Remove extra space */
      }
      .error-message {
         position: absolute; /* Position over video if it fails later */
         top: 0; left: 0; width: 100%;
         color: white;
         background-color: rgba(0,0,0,0.7);
         font-family: sans-serif;
         text-align: center;
         padding: 20px;
         box-sizing: border-box; /* Include padding in width */
         z-index: 10;
      }
      .error-message p { margin: 5px 0; }
    `;
    document.head.appendChild(style);

    // Create container and video element
    const container = document.createElement('div');
    container.id = 'hlsVideoContainer';

    const video = document.createElement('video');
    video.id = 'hlsVideoPlayer';
    video.controls = true;
    video.autoplay = true; // Attempt to autoplay
    video.muted = false; // Try unmuted first

    container.appendChild(video);
    document.body.appendChild(container);

    return video; // Return the video element
  }

  // --- Load and initialize hls.js ---
  function loadHlsJs(videoElement) {
    const hlsUrl = window.location.href; // Get the URL of the current tab (.m3u8 file)
    const hlsScript = document.createElement('script');
    hlsScript.src = chrome.runtime.getURL('lib/hls.min.js'); // Get correct extension URL

    hlsScript.onload = () => {
      console.log('hls.min.js loaded successfully.');
      if (typeof Hls === 'undefined') {
          console.error('Hls object not found after loading script.');
          displayError('Failed to load HLS library.');
          return;
      }

      if (Hls.isSupported()) {
        console.log('HLS is supported by this browser.');
        const hls = new Hls({
           // debug: true // Enable for detailed logs if needed
        });

        console.log(`Loading HLS source: ${hlsUrl}`);
        hls.loadSource(hlsUrl);

        console.log(`Attaching media to video element: ${videoElement.id}`);
        hls.attachMedia(videoElement);

        hls.on(Hls.Events.MANIFEST_PARSED, function() {
          console.log('Manifest parsed, attempting to play...');
          videoElement.play().catch(e => {
              console.warn("Autoplay possibly prevented:", e);
              // Maybe display a "Click to Play" button if autoplay fails
              // For now, the controls are visible.
          });
        });

        hls.on(Hls.Events.ERROR, function(event, data) {
          console.error('HLS.js Error:', event, data);
          let errorMsg = `HLS Error: ${data.details || 'Unknown error'}`;
          if (data.fatal) {
            errorMsg = `Fatal HLS Error (${data.type}): ${data.details}`;
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error('Fatal network error encountered, trying to recover...');
                hls.startLoad(); // Try to recover
                 errorMsg += " (Attempting recovery)";
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error('Fatal media error encountered, trying to recover...');
                hls.recoverMediaError();
                 errorMsg += " (Attempting recovery)";
                break;
              default:
                console.error('Unrecoverable fatal error encountered.');
                 errorMsg += " (Unrecoverable)";
                hls.destroy();
                break;
            }
          }
          displayError(errorMsg);
        });

      } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        console.log('HLS.js not supported, falling back to native HLS.');
        videoElement.src = hlsUrl;
        videoElement.addEventListener('loadedmetadata', function() {
          videoElement.play().catch(e => console.warn("Native autoplay possibly prevented:", e));
        });
        videoElement.addEventListener('error', (e) => {
            const nativeError = videoElement.error;
            console.error('Native HLS playback error:', nativeError);
            displayError(`Native HLS Error: Code ${nativeError?.code}, Message: ${nativeError?.message || 'Unknown error'}`);
        });
      } else {
          console.error('HLS is not supported in this browser.');
          displayError('Sorry, HLS video playback is not supported in your browser.');
      }
    };

    hlsScript.onerror = () => {
      console.error('Failed to load hls.min.js script.');
      displayError('Critical Error: Could not load the HLS playback library.');
    };

    document.body.appendChild(hlsScript); // Append script to start loading
  }

  function displayError(message) {
      console.info("Displaying error:", message); // Log the message being displayed
      let errorDiv = document.querySelector('.error-message');
      if (!errorDiv) {
          errorDiv = document.createElement('div');
          errorDiv.className = 'error-message';
          // Prepend to body to make sure it's visible
          if (document.body) {
              document.body.prepend(errorDiv);
          } else {
              // Fallback if body isn't available for some reason
              alert(`HLS Player Error:\n${message}`);
              return; // Stop if we can't even show the div
          }
      }
      // Append new message line
      const p = document.createElement('p');
      p.textContent = message;
      errorDiv.appendChild(p);

      // Ensure video isn't covering the error if it exists
      const videoPlayer = document.getElementById('hlsVideoPlayer');
      if(videoPlayer) videoPlayer.style.display = 'none';
  }

})(); // IIFE