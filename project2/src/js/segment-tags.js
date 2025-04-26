// js/segment-tags.js
console.log('[segment-tags] Enhancing segment visuals');

document.addEventListener('DOMContentLoaded', () => {
    observeSegmentList();
    listenForExpirationEvents();
});

function observeSegmentList() {
    const observer = new MutationObserver(() => {
        document.querySelectorAll('#metadataList div[data-segment-id]').forEach(el => {
            const url = el.getAttribute('data-segment-url');
            const type = classifySegment(url);
            const badge = buildBadge(type);

            if (badge && !el.querySelector('.segment-badge')) {
                el.insertBefore(badge, el.firstChild.nextSibling); // after timestamp
            }
        });
    });

    const container = document.getElementById('metadataList');
    if (container) {
        observer.observe(container, { childList: true, subtree: true });
    }
}


function classifySegment(rawUrl = '') {
    let pathname = '';
    let url = rawUrl.toLowerCase();

    try {
        pathname = new URL(rawUrl).pathname;
    } catch {
        pathname = rawUrl.split('?')[0]; // fallback if it's not a full URL
    }

    const isAudio = pathname.includes('audio=') || pathname.includes('audio_eng=');
    const isVideo = pathname.includes('video=') || pathname.includes('video_eng=');
    const adMatch = /\b(ad|scte|splice)\b/.test(pathname);

    if (pathname.endsWith('.m3u8')) return 'Playlist';
    if (pathname.includes('metadata')) return 'Metadata';
    if (adMatch) return 'Ad';

    if (isAudio && isVideo) return 'Muxed';
    if (isAudio) return 'Audio-Only';
    if (isVideo) return 'Video-Only';

    if (pathname.endsWith('.ts') || pathname.endsWith('.m4s') || pathname.endsWith('.mp4')) return 'Live';

    return 'Segment';
}



function buildBadge(label) {
    if (!label) return null;
    const badge = document.createElement('span');
    badge.className = `segment-badge segment-${label.toLowerCase()}`;
    badge.textContent = label;
    return badge;
}

function listenForExpirationEvents() {
    document.addEventListener('segmentExpired', (e) => {
        const segmentId = e.detail?.id;
        const el = document.querySelector(`[data-segment-id="${segmentId}"]`);
        if (el && !el.querySelector('.segment-expired')) {
            const badge = document.createElement('span');
            badge.className = 'segment-expired';
            badge.textContent = 'EXPIRED';
            el.appendChild(badge);
        }
    });
}
