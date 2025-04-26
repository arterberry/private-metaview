// js/player_loader.js

document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('hlsVideoPlayer');
    if (!video) {
        console.error('[player_loader] Video element not found');
        return;
    }

    const hlsUrl = getRawSrcUrl();
    if (!hlsUrl) {
        console.warn('[player_loader] No HLS URL found in query params');
        return;
    }

    console.log('[player_loader] HLS URL:', hlsUrl);

    if (Hls.isSupported()) {
        console.log('[player_loader] HLS.js is supported. Initializing...');
        const hlsConfig = {
            // --- Configuration from old code ---
            debug: false, // Keep debug off by default, can be enabled if needed
            // loader: createCustomLoader(Hls), // Omit custom loader for now
            maxBufferLength: 60,
            maxMaxBufferLength: 600,
            maxBufferSize: 60 * 1000 * 1000, // 60MB
            maxBufferHole: 0.5,
            highBufferWatchdogPeriod: 3,
            nudgeOffset: 0.1,
            nudgeMaxRetry: 5,
            abrEwmaDefaultEstimate: 500000, // 500kbps
            abrEwmaFastLive: 3,
            abrEwmaSlowLive: 9,
            startLevel: -1, // Auto start level
            manifestLoadingTimeOut: 15000,
            manifestLoadingMaxRetry: 4,
            manifestLoadingRetryDelay: 1000,
            manifestLoadingMaxRetryTimeout: 64000,
             // --- End of old config ---

            // xhrSetup from existing code (modify if needed)
            xhrSetup: function (xhr, url) {
                // console.log('[player_loader] XHR request to:', url); // Can be noisy
                xhr.setRequestHeader('Accept', '*/*');
                xhr.setRequestHeader('Cache-Control', 'no-cache');
                xhr.setRequestHeader('Pragma', 'no-cache');
            },
        };
        console.log('[player_loader] HLS Config:', hlsConfig);
        const hls = new Hls(hlsConfig);

        window.hlsPlayerInstance = hls; // Make instance globally accessible

        hls.loadSource(hlsUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_LOADING, function (event, data) {
            console.log("[player_loader] HLS Event: Manifest loading:", data.url);
            if (window.addPlayerLogEntry) window.addPlayerLogEntry(`Manifest loading: ${getShortUrl(data.url)}`);
        });

        hls.on(Hls.Events.FRAG_LOADING, function (event, data) {            
            console.log(`[player_loader] HLS Event: Fragment loading: ${data.frag.sn} (${data.frag.url})`);
            // if (window.addPlayerLogEntry) window.addPlayerLogEntry(`Frag loading: ${data.frag.sn} (${getShortUrl(data.frag.url)})`);
        });

        hls.on(Hls.Events.FRAG_LOADED, function (event, data) {
             console.log(`[player_loader] HLS Event: Fragment loaded: ${data.frag.sn} (${getShortUrl(data.frag.url)})`);
             let segmentInfo = `Frag loaded: ${data.frag.sn}, Dur: ${data.frag.duration.toFixed(2)}s, Level: ${data.frag.level}`;
             console.log(`[player_loader] HLS Event: Segment Info: : ${segmentInfo}`); 
             // if (window.addPlayerLogEntry) window.addPlayerLogEntry(segmentInfo);
        });        

        hls.on(Hls.Events.ERROR, function (event, data) {
            console.error("[player_loader] HLS Error:", data);

            // --- Add Buffering Check HERE ---
            if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
                console.warn('[player_loader] Buffer stalled error detected by main error handler.');
                bufferingIndicator.style.display = 'block'; // Show indicator
                if (window.addPlayerLogEntry) window.addPlayerLogEntry('Playback stalled (buffer empty)', true); // Log stall specifically
                // Don't necessarily treat buffer stall as a general error message below unless needed
            }
            // --- End Buffering Check ---

            // General Error Logging
            let errorMessage = `HLS Error: ${data.details}`;
            if (data.response) errorMessage += ` - Status: ${data.response.code}`;
            if (data.url) errorMessage += ` - URL: ${getShortUrl(data.url)}`;
            if (data.error) errorMessage += ` - ${data.error.message || data.error}`;

            // Log general error unless it was just a buffer stall (which we already logged)
            if (data.details !== Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
                 if (window.addPlayerLogEntry) window.addPlayerLogEntry(errorMessage, true); // Log as error
            }


            // Fatal Error Handling
            if (data.fatal) {
                console.error("HLS Fatal Error occurred.");
                if (window.addPlayerLogEntry) window.addPlayerLogEntry(`FATAL ERROR: ${data.details}`, true);
                // Optional: Add recovery logic here if needed
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                         console.log("Attempting recovery: hls.startLoad()");
                         hls.startLoad();
                         break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                         console.log("Attempting recovery: hls.recoverMediaError()");
                         hls.recoverMediaError();
                         break;
                    default:
                         console.log("Non-recoverable fatal error or unhandled type.");
                         // hls.destroy(); // Use destroy cautiously
                         break;
                }
            }
        });

        // --- Buffering Indicator Logic ---
        const bufferingIndicator = document.createElement('div');
        bufferingIndicator.id = 'bufferingIndicator';
        bufferingIndicator.textContent = 'Buffering...';
        Object.assign(bufferingIndicator.style, {
            display: 'none',
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '5px',
            zIndex: '1000',
            pointerEvents: 'none' // Ensure it doesn't block video controls
        });
        const videoContainer = document.querySelector('.video-container');
        if (videoContainer) {
            videoContainer.appendChild(bufferingIndicator);
        } else {
            console.warn('[player_loader] Video container not found for buffering indicator.');
        }

         // Also listen for BUFFER_APPENDING which means we might recover
         hls.on(Hls.Events.BUFFER_APPENDING, function() {
              if (video.paused && video.readyState >= 3) {
                 // If paused but enough data, hide indicator
                 bufferingIndicator.style.display = 'none';
             }
         });
         hls.on(Hls.Events.BUFFER_EOS, function() {
              // End of stream, hide indicator
              bufferingIndicator.style.display = 'none';
         });


        // Show/Hide based on video element events
        video.addEventListener('waiting', function () {
            // 'waiting' fires when playback stops due to lack of data
             console.log('[player_loader] Video event: waiting (buffering)');
            bufferingIndicator.style.display = 'block';
        });
        video.addEventListener('playing', function () {
             // 'playing' fires when playback resumes after buffering or seeking
             console.log('[player_loader] Video event: playing');
            bufferingIndicator.style.display = 'none';
        });
         video.addEventListener('seeking', function () {
            // Show buffering briefly during seek
            bufferingIndicator.style.display = 'block';
        });
        video.addEventListener('seeked', function () {
            // Hide buffering after seek completes if video can play
            if (!video.paused) {
                bufferingIndicator.style.display = 'none';
            }
        });
        video.addEventListener('pause', function () {
             // Hide indicator if user pauses
             bufferingIndicator.style.display = 'none';
        });


        // --- End of Buffering Logic ---

        hls.loadSource(hlsUrl);
        hls.attachMedia(video);

        // MANIFEST_PARSED listener (already existed, slightly modified log)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log('[player_loader] HLS Event: Manifest parsed. Attempting playback.');
            if (window.addPlayerLogEntry) window.addPlayerLogEntry('Manifest parsed, starting playback.');
            video.play().catch(err => {
                 console.warn('[player_loader] Autoplay failed:', err.message);
                 if (window.addPlayerLogEntry) window.addPlayerLogEntry(`Autoplay failed: ${err.message}`, true);
                 // Show controls so user can play manually
                 video.controls = true;
            });
        });

        // Broadcast event AFTER attaching listeners
        console.log('[player_loader] Dispatching hlsLoaded event.');
        document.dispatchEvent(new CustomEvent('hlsLoaded', { detail: { hls } }));

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        
        window.hlsPlayerInstance = null; // no HLS.js instance

        // Safari / native fallback
        video.src = hlsUrl;
        video.addEventListener('loadedmetadata', () => {
            console.log('[player_loader] Native HLS loaded, starting playback');
            if (window.addPlayerLogEntry) window.addPlayerLogEntry('Native HLS playback started.');
            video.play().catch(err => {
                console.warn('[player_loader] Native autoplay error:', err);
                if (window.addPlayerLogEntry) window.addPlayerLogEntry(`Native autoplay failed: ${err.message}`, true);
            });
        });
        // Add basic error logging for native playback
        video.addEventListener('error', (e) => {
             console.error('[player_loader] Native video error:', e);
             const error = video.error;
             if (window.addPlayerLogEntry && error) window.addPlayerLogEntry(`Native Player Error: Code ${error.code}, ${error.message}`, true);
        });
    } else {
        window.hlsPlayerInstance = null; // no HLS.js instance
        console.error('[player_loader] HLS not supported in this browser');
        if (window.addPlayerLogEntry) window.addPlayerLogEntry('HLS playback not supported in this browser.', true);
    }
});

// Helper function for short URLs (if not already available)
function getShortUrl(url, maxLength = 60) {
    if (!url) return '';
    if (url.length <= maxLength) return url;
    try {
        const parsed = new URL(url);
        const pathParts = parsed.pathname.split('/').filter(Boolean);
        const file = pathParts.pop() || '';
        const domain = parsed.hostname;
        let shortPath = pathParts.length > 0 ? `/.../${pathParts[pathParts.length - 1]}/` : '/';
        return `${domain}${shortPath}${file.substring(0, 15)}${file.length > 15 ? '...' : ''}${parsed.search}`;
    } catch {
        return url.substring(0, maxLength / 2) + '...' + url.substring(url.length - maxLength / 2);
    }
}

/** Extracts the full raw src from the query without decoding */
function getRawSrcUrl() {
    const raw = new URLSearchParams(window.location.search).get('src');
    console.log('[player_loader] Raw "src" from query:', raw);
    return raw || null;
}
