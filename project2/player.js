console.log("HLS Player Page Script Loaded.");

document.addEventListener('DOMContentLoaded', () => {
    const videoElement = document.getElementById('hlsVideoPlayer');
    const urlParams = new URLSearchParams(window.location.search);
    const m3u8Src = urlParams.get('src'); // Get the original M3U8 URL

    if (!videoElement) {
        console.error("Video element not found!");
        return;
    }
    if (!m3u8Src) {
        console.error("M3U8 source URL not found in query parameters!");
        // Display error to user?
        document.body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Error: M3U8 source URL missing.</p>';
        return;
    }

    console.log(`Attempting to play HLS stream: ${m3u8Src}`);

    const sidePanelButton = document.getElementById('side-panel-button');
    if (sidePanelButton) {
        sidePanelButton.addEventListener('click', async () => {
            console.log('Side panel button clicked');
            try {
                // Get the current window
                const currentWindow = await chrome.windows.getCurrent();
                if (currentWindow) {
                    // Open the side panel
                    await chrome.sidePanel.open({ windowId: currentWindow.id });
                    console.log('Side panel opened');
                } else {
                    console.error('Could not get current window');
                }
            } catch (error) {
                console.error('Error opening side panel:', error);
            }
        });
    } else {
        console.error('Side panel button not found');
    }    

    if (Hls.isSupported()) {
        console.log("HLS.js is supported. Initializing...");
        const hls = new Hls({
             // Add any hls.js configuration options here
             // Example: enableWorker: true, lowLatencyMode: true, etc.
             debug: false // Set to true for verbose HLS debugging in console
        });

        // Load the source URL
        hls.loadSource(decodeURIComponent(m3u8Src));

        // Bind video element
        hls.attachMedia(videoElement);

        // --- HLS Event Listeners (for data gathering and sending to side panel) ---
        hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
            console.log("Manifest parsed, levels available:", data.levels);
            videoElement.play().catch(e => console.warn("Autoplay failed:", e)); // Attempt to play

            // *** Example: Send data to side panel ***
            chrome.runtime.sendMessage({
                type: "HLS_MANIFEST_DATA",
                payload: {
                    url: decodeURIComponent(m3u8Src),
                    levels: data.levels.map(l => ({ height: l.height, bitrate: l.bitrate })),
                }
            }).catch(e => console.warn("Failed to send manifest data to side panel:", e)); // Add catch for potential errors if panel isn't open/listening
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, function (event, data) {
            const currentLevel = hls.levels[data.level];
            console.log('Switched to level:', currentLevel);
             // *** Example: Send data to side panel ***
            chrome.runtime.sendMessage({
                type: "HLS_LEVEL_SWITCH",
                payload: {
                     height: currentLevel.height,
                     bitrate: currentLevel.bitrate
                }
            }).catch(e => console.warn("Failed to send level switch data to side panel:", e));
        });

        // Add listeners for FRAG_LOADED, ERROR, etc. to gather more data
        // hls.on(Hls.Events.FRAG_LOADED, function(event, data) { /* ... send message ... */ });

        hls.on(Hls.Events.ERROR, function (event, data) {
            console.error('HLS Error:', data);
             // *** Example: Send data to side panel ***
            chrome.runtime.sendMessage({
                type: "HLS_ERROR",
                payload: {
                     type: data.type,
                     details: data.details,
                     fatal: data.fatal,
                     url: data.url // URL of fragment/manifest causing error (if applicable)
                }
            }).catch(e => console.warn("Failed to send error data to side panel:", e));

            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.error('Fatal network error encountered, trying to recover...');
                        hls.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.error('Fatal media error encountered, trying to recover...');
                        hls.recoverMediaError();
                        break;
                    default:
                        // Cannot recover
                        console.error('Unrecoverable fatal HLS error.');
                        hls.destroy();
                        break;
                }
            }
        });

    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        // Fallback for browsers with native HLS support (less common now, mainly Safari)
        // Hls.js might not be needed, but you wouldn't get detailed events.
        console.log("HLS.js not supported, but native HLS playback might work.");
        videoElement.src = decodeURIComponent(m3u8Src);
        videoElement.addEventListener('loadedmetadata', function () {
            videoElement.play().catch(e => console.warn("Autoplay failed:", e));
        });
         chrome.runtime.sendMessage({
                type: "NATIVE_HLS_PLAYBACK",
                payload: { url: decodeURIComponent(m3u8Src) }
            }).catch(e => console.warn("Failed to send native playback info to side panel:", e));
    } else {
         console.error("HLS is not supported in this browser.");
         document.body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Error: HLS playback is not supported in your browser.</p>';
         chrome.runtime.sendMessage({
                type: "HLS_NOT_SUPPORTED",
                payload: { url: decodeURIComponent(m3u8Src) }
            }).catch(e => console.warn("Failed to send HLS not supported info to side panel:", e));
    }
});