// player_loader.js

document.addEventListener('DOMContentLoaded', () => {
    const hlsUrl = new URLSearchParams(window.location.search).get('src');

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
        const hls = new Hls();
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
