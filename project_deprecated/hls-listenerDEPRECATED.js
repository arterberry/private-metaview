// js/hls-listener.js

console.log('[hls-listener] Initialized');

document.addEventListener('hlsLoaded', (e) => {
    const hls = e.detail?.hls;
    if (!hls) return;

    console.log('[hls-listener] HLS.js hooked');

    hls.on(Hls.Events.FRAG_LOADING, (_, data) => {
        const url = data.frag?.url;
        const sn = data.frag?.sn ?? 0;
        const duration = data.frag?.duration ?? 0;

        if (!url) return;

        const id = `live_${sn}_${Date.now()}`;
        const fileName = getSegmentDisplayName(url);
        const timestamp = formatSegmentTime(sn, duration);
        const label = `Live Fragment: ${fileName}`;

        const segment = {
            id,
            url,
            title: label,
            type: 'fragment',
            sequence: sn,
            duration,
            timestamp
        };

        // Avoid duplicates
        if (!window.__liveSegmentCache) {
            window.__liveSegmentCache = new Set();
        }
        if (window.__liveSegmentCache.has(url)) return;
        window.__liveSegmentCache.add(url);

        if (typeof addSegmentToUI === 'function') {
            addSegmentToUI(segment);
        } else {
            console.warn('[hls-listener] addSegmentToUI not ready yet');
        }

        if (typeof state !== 'undefined' && Array.isArray(state.segments)) {
            state.segments.push(segment);
        }
    });
});

function getSegmentDisplayName(url) {
    try {
        const parts = new URL(url).pathname.split('/');
        return parts.pop() || 'Segment';
    } catch {
        return 'Segment';
    }
}

// Fallback formatter if not available in manifest.js
function formatSegmentTime(seq, duration) {
    const totalSeconds = seq * duration;
    const ms = Math.floor((totalSeconds % 1) * 1000);
    const s = Math.floor(totalSeconds % 60);
    const m = Math.floor((totalSeconds / 60) % 60);
    const h = Math.floor(totalSeconds / 3600);

    return [
        h > 0 ? String(h).padStart(2, '0') : null,
        String(m).padStart(2, '0'),
        String(s).padStart(2, '0')
    ]
        .filter(Boolean)
        .join(':') + `.${String(ms).padStart(3, '0')}`;
}
