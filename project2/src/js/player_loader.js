// player_loader.js

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
        const hls = new Hls({
            xhrSetup: function (xhr, url) {
                console.log('[player_loader] XHR request to:', url);
                
                // Optional headers (safe to set)
                xhr.setRequestHeader('Accept', '*/*');
                xhr.setRequestHeader('Cache-Control', 'no-cache');
                xhr.setRequestHeader('Pragma', 'no-cache');
            },
            manifestLoadingTimeOut: 15000,
            manifestLoadingMaxRetry: 4
        });

        hls.loadSource(hlsUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            console.log('[player_loader] HLS manifest parsed, starting playback');
            video.play().catch(err => {
                console.warn('[player_loader] Autoplay error:', err);
            });
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
            console.error('[player_loader] HLS.js error:', data);
        });

        // Broadcast HLS instance for manifest.js to hook into
        document.dispatchEvent(new CustomEvent('hlsLoaded', { detail: { hls } }));
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari / native fallback
        video.src = hlsUrl;
        video.addEventListener('loadedmetadata', () => {
            console.log('[player_loader] Native HLS loaded, starting playback');
            video.play().catch(err => {
                console.warn('[player_loader] Native autoplay error:', err);
            });
        });
    } else {
        console.error('[player_loader] HLS not supported in this browser');
    }
});

/** Extracts the full raw src from the query without decoding */
function getRawSrcUrl() {
    const raw = new URLSearchParams(window.location.search).get('src');
    console.log('[player_loader] Raw "src" from query:', raw);
    return raw || null;
}
