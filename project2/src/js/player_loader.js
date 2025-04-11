// player_loader.js

document.addEventListener('DOMContentLoaded', () => {

    function getFullSrc() {
        // Get the raw src from the URL
        const raw = new URLSearchParams(window.location.search).get('src');
        console.log('[player_loader] Raw "src" from query:', raw);
        
        if (!raw) return null;
        
        // Don't decode or modify the URL at all - just return as is
        // This preserves ALL query parameters and authentication tokens
        console.log('[player_loader] Using raw URL with all parameters preserved');
        return raw;
    }    

    const hlsUrl = getFullSrc();

    console.log('[player_loader] Full decoded HLS URL:', hlsUrl);
    console.log('[player_loader] Final HLS URL passed to HLS.js:', hlsUrl);


    if (!hlsUrl) {
        console.warn('[player_loader] No HLS URL found in query params');
        return;
    }

    const video = document.getElementById('hlsVideoPlayer');
    if (!video) {
        console.error('[player_loader] Video element not found');
        return;
    }

    // HLS.js path
    if (Hls.isSupported()) {
        const hls = new Hls({
            xhrSetup: function(xhr, url) {
                // Log the actual URL being requested by HLS.js
                console.log('[player_loader] Actual XHR request URL:', url);
                
                // Add headers that match browser defaults
                xhr.setRequestHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7');
                xhr.setRequestHeader('Cache-Control', 'no-cache');
                xhr.setRequestHeader('Pragma', 'no-cache');
                xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36');
            },
            // Set a longer timeout for fetching segments
            manifestLoadingTimeOut: 15000,
            manifestLoadingMaxRetry: 4
        });
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log('[player_loader] HLS manifest parsed, starting playback');
            video.play();
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
            console.error('[player_loader] HLS.js error:', data);
        });

        // Broadcast loaded instance for manifest.js to hook into
        document.dispatchEvent(new CustomEvent('hlsLoaded', { detail: { hls } }));
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native support fallback (Safari)
        video.src = hlsUrl;
        video.addEventListener('loadedmetadata', () => {
            console.log('[player_loader] Native HLS metadata loaded, starting playback');
            video.play();
        });
    } else {
        console.error('[player_loader] HLS not supported on this browser');
    }
});
