// player.js - Logic for player.html

(function() {
    console.log("Player.js running.");
    const videoElement = document.getElementById('hlsVideoPlayer');
    const container = document.getElementById('hlsVideoContainer');

    if (!videoElement || !container) {
        console.error("Essential player elements not found!");
        alert("Error: Could not initialize player UI.");
        return;
    }
    
    // Attempt to unmute now or after play starts
    videoElement.muted = false;

    // --- Get M3U8 URL from query parameter ---
    const urlParams = new URLSearchParams(window.location.search);
    const hlsUrl = urlParams.get('src');

    if (!hlsUrl) {
        displayError("Error: No HLS source URL provided in query parameters.");
        console.error("Missing 'src' query parameter.");
        return;
    }

    console.log(`Player intends to load HLS source: ${hlsUrl}`);
    document.title = `HLS Player - ${hlsUrl.split('/').pop()}`; // Set title

    // --- Load and initialize hls.js ---
    loadHlsJs(videoElement, hlsUrl);


    // --- Function Definitions ---

    function loadHlsJs(videoEl, sourceUrl) {
        const hlsScript = document.createElement('script');
        // Use chrome.runtime.getURL ONLY if loading from within the extension context
        // If player.js is loaded via <script src="player.js"> in player.html,
        // relative paths or absolute extension paths work. Let's use relative.
        // NOTE: hls.min.js MUST be listed in web_accessible_resources
         hlsScript.src = chrome.runtime.getURL('lib/hls.min.js'); // More reliable

        hlsScript.onload = () => {
            console.log('hls.min.js loaded successfully.');
            if (typeof Hls === 'undefined') {
                console.error('Hls object not found.');
                displayError('Failed to load HLS library.');
                return;
            }

            if (Hls.isSupported()) {
                console.log('HLS is supported.');
                const hls = new Hls({
                    // debug: true
                });

                console.log(`Loading HLS source via hls.js: ${sourceUrl}`);
                hls.loadSource(sourceUrl);

                console.log(`Attaching media to video element.`);
                hls.attachMedia(videoEl);

                hls.on(Hls.Events.MANIFEST_PARSED, function() {
                    console.log('Manifest parsed, attempting play...');
                    videoEl.play().then(() => {
                        console.log("Playback started via play().");
                         videoEl.muted = false; // Try unmuting again
                    }).catch(e => {
                        console.warn("Autoplay possibly prevented:", e);
                        // Keep controls visible for user interaction
                    });
                });

                hls.on(Hls.Events.ERROR, function(event, data) {
                    console.error('HLS.js Error:', event, data);
                    let errorMsg = `HLS Error: ${data.details || 'Unknown error'}`;
                    if (data.fatal) {
                         errorMsg = `Fatal HLS Error (${data.type}): ${data.details}`;
                        switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.error('Fatal network error, attempting recovery...');
                            hls.startLoad();
                            errorMsg += " (Attempting recovery)";
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.error('Fatal media error, attempting recovery...');
                            hls.recoverMediaError();
                             errorMsg += " (Attempting recovery)";
                            break;
                        default:
                            console.error('Unrecoverable fatal error.');
                             errorMsg += " (Unrecoverable)";
                            hls.destroy();
                            break;
                        }
                    }
                    displayError(errorMsg);
                });

            } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
                console.log('HLS.js not supported, trying native HLS.');
                videoEl.src = sourceUrl;
                videoEl.addEventListener('loadedmetadata', function() {
                    videoEl.play().catch(e => console.warn("Native autoplay possibly prevented:", e));
                });
                 videoEl.addEventListener('error', (e) => {
                    const nativeError = videoEl.error;
                    console.error('Native HLS playback error:', nativeError);
                    displayError(`Native HLS Error: Code ${nativeError?.code}, Message: ${nativeError?.message || 'Unknown error'}`);
                });
            } else {
                console.error('HLS is not supported.');
                displayError('Sorry, HLS video playback is not supported in your browser.');
            }
        };

        hlsScript.onerror = (e) => {
            console.error('Failed to load hls.min.js script.', e);
            displayError('Critical Error: Could not load the HLS playback library.');
        };

        document.body.appendChild(hlsScript);
    }

    function displayError(message) {
        console.info("Displaying error:", message);
        let errorDiv = container.querySelector('.error-message');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            container.prepend(errorDiv); // Prepend inside the main container
        }

        const p = document.createElement('p');
        p.textContent = message;
        errorDiv.appendChild(p);

        if (videoElement) videoElement.style.display = 'none'; // Hide video on error
    }

})(); // IIFE