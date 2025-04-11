// manifest.js - HLS Manifest Parser and Loader
console.log('HLS Manifest Parser loading...');

// Global manifest state
const state = {
    masterUrl: null,
    masterManifest: null,
    mediaPlaylists: {},
    segments: [],
    activeMediaPlaylist: null,
    segmentCounter: 0,
    playlistRefreshInterval: null,
    updateInterval: 3000,
    isLive: false
};

// ---- DOM Ready ----
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing manifest loader...');


    function getFullSrc() {
        // Get the raw src from the URL
        const raw = new URLSearchParams(window.location.search).get('src');
        console.log('[manifest.js] Raw "src" from query:', raw);

        if (!raw) return null;

        // Don't decode or modify the URL at all
        console.log('[manifest.js] Using raw URL with all parameters preserved');
        return raw;
    }

    let hlsUrl = getFullSrc();

    console.log(`Loading HLS manifest from: ${hlsUrl}`);
    initHlsParser(hlsUrl);
    setupUIHandlers();
});

// ---- Parser Init ----
function initHlsParser(url) {
    state.masterUrl = url;
    updateStatus(`Loading manifest: ${url}`);

    fetchManifest(url)
        .then(content => {
            addSegmentToUI({
                id: 'master',
                url,
                title: 'Master Playlist',
                type: 'master'
            });
            if (isMasterPlaylist(content)) {
                console.log('Detected master playlist');
                parseMasterPlaylist(content, url);
            } else {
                console.log('Detected media playlist');
                handleDirectMediaPlaylist(content, url);
            }
        })
        .catch(err => {
            console.error('Manifest load failed:', err);
            updateStatus(`Error loading manifest: ${err.message}`);
        });
}

// ---- Media Playlist Direct Handling ----
function handleDirectMediaPlaylist(content, url) {
    const id = 'default';

    addSegmentToUI({
        id: `media_${id}`,
        url,
        title: 'Media Playlist',
        type: 'media'
    });

    state.mediaPlaylists[id] = { url, content, segments: [] };
    state.activeMediaPlaylist = id;
    parseMediaPlaylist(content, url, id);

    if (!content.includes('#EXT-X-ENDLIST')) {
        state.isLive = true;
        startPlaylistRefresh(url, id);
    }
}

// ---- Playlist Fetch ----
function fetchManifest(url) {
    console.log('[manifest.js] Fetching URL:', url);
    
    return fetch(url, {
        method: 'GET',
        headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
        },
        credentials: 'omit', // Don't send cookies
        mode: 'cors'         // Use CORS mode
    })
    .then(res => {
        console.log('[manifest.js] Response status:', res.status, res.statusText);
        if (!res.ok) throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
        return res.text();
    });
}



function isMasterPlaylist(content) {
    return content.includes('#EXT-X-STREAM-INF');
}

// ---- Master Playlist Parsing ----
function parseMasterPlaylist(content, baseUrl) {
    state.masterManifest = content;
    updateStatus('Parsing master playlist...');

    const variants = extractVariantStreams(content);
    console.log(`Found ${variants.length} variant streams`);

    document.title = getTitleFromManifest(content, baseUrl);

    if (variants.length === 0) return;

    const { uri, bandwidth, resolution } = variants[0];
    const mediaUrl = resolveUrl(uri, baseUrl);
    const id = 'variant_0';

    addSegmentToUI({
        id: `media_${id}`,
        url: mediaUrl,
        title: 'Media Playlist',
        type: 'media'
    });

    state.activeMediaPlaylist = id;
    updateStatus(`Loading media playlist: ${mediaUrl}`);

    fetchManifest(mediaUrl)
        .then(mediaContent => {
            state.mediaPlaylists[id] = { url: mediaUrl, content: mediaContent, bandwidth, resolution, segments: [] };
            parseMediaPlaylist(mediaContent, mediaUrl, id);

            if (!mediaContent.includes('#EXT-X-ENDLIST')) {
                state.isLive = true;
                startPlaylistRefresh(mediaUrl, id);
            }
        })
        .catch(err => {
            console.error('Media playlist load failed:', err);
            updateStatus(`Error loading media playlist: ${err.message}`);
        });
}


function getTitleFromManifest(content, baseUrl) {
    const title = content.match(/#EXT-X-SESSION-DATA:NAME="TITLE",VALUE="([^"]+)"/);
    return title ? `HLS Player - ${title[1]}` : `HLS Player - ${new URL(baseUrl).pathname.split('/').pop()}`;
}

// ---- Variant Stream Extraction ----
function extractVariantStreams(content) {
    const lines = content.split('\n');
    const streams = [];
    let streamInfo = null;

    for (const line of lines.map(l => l.trim())) {
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
            streamInfo = {
                bandwidth: parseInt(line.match(/BANDWIDTH=(\d+)/)?.[1], 10),
                resolution: line.match(/RESOLUTION=(\d+x\d+)/)?.[1],
                codecs: line.match(/CODECS="([^"]+)"/)?.[1]
            };
        } else if (streamInfo && line && !line.startsWith('#')) {
            streamInfo.uri = line;
            streams.push(streamInfo);
            streamInfo = null;
        }
    }

    return streams.sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0));
}

// ---- Media Playlist Parsing ----
function parseMediaPlaylist(content, baseUrl, id) {
    updateStatus('Parsing media playlist...');

    const lines = content.split('\n');
    const segments = [];
    let seq = parseInt(content.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1], 10) || 0;
    let current = null;

    for (const lineRaw of lines) {
        const line = lineRaw.trim();
        if (!line) continue;

        if (line.startsWith('#EXTINF:')) {
            const duration = parseFloat(line.match(/#EXTINF:([\d.]+)/)?.[1]);
            const title = line.includes(',') ? line.split(',')[1].trim() : '';
            current = {
                duration: duration || 0,
                title: title,
                timestamp: formatSegmentTime(seq, duration || 0) // we'll define this below
            };
        } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
            const [length, offset] = line.match(/\d+/g) || [];
            if (current) current.byteRange = { length: +length, offset: offset ? +offset : 0 };
        } else if (line.startsWith('#EXT-X-KEY:')) {
            const encryption = {
                method: line.match(/METHOD=([^,]+)/)?.[1],
                uri: resolveUrl(line.match(/URI="([^"]+)"/)?.[1], baseUrl),
                iv: line.match(/IV=([^,]+)/)?.[1]
            };
            if (current) current.encryption = encryption;
        } else if (current && !line.startsWith('#')) {
            Object.assign(current, {
                url: resolveUrl(line, baseUrl),
                sequence: seq,
                playlistId: id,
                id: `${id}_${seq}`
            });

            if (!state.segments.find(s => s.id === current.id)) {
                state.segments.push(current);
                state.segmentCounter++;
                addSegmentToUI(current);
            }

            segments.push(current);
            current = null;
            seq++;
        }
    }

    state.mediaPlaylists[id].segments = segments;
    updateStatus(`Loaded ${segments.length} segments`);
}

// ---- Playlist Refresh (Live) ----
function startPlaylistRefresh(url, id) {
    clearInterval(state.playlistRefreshInterval);

    console.log(`Starting playlist refresh for ${url} every ${state.updateInterval}ms`);

    state.playlistRefreshInterval = setInterval(() => {
        fetchManifest(url)
            .then(content => {
                if (state.mediaPlaylists[id].content !== content) {
                    state.mediaPlaylists[id].content = content;
                    parseMediaPlaylist(content, url, id);
                }
            })
            .catch(err => console.error('Error refreshing playlist:', err));
    }, state.updateInterval);
}

// ---- UI Handlers ----
function addSegmentToUI(segment) {
    const container = document.getElementById('metadataList');
    if (!container) return;

    const el = document.createElement('div');
    el.setAttribute('data-segment-id', segment.id);
    el.setAttribute('data-segment-url', segment.url);

    const time = document.createElement('span');
    let prefix = '';

    if (segment.type === 'master') {
        prefix = '[Master]';
    } else if (segment.type === 'media') {
        prefix = '[Media]';
    } else {
        const timestamp = formatSegmentTime(segment.sequence, segment.duration || 0);
        prefix = `[${timestamp}]`;
    }

    if (segment.type === 'master' || segment.type === 'media') {
        const readable = document.createElement('div');
        readable.setAttribute('data-segment-id', `${segment.id}_readable`);
        readable.setAttribute('data-segment-url', segment.url);

        const label = document.createElement('span');
        label.textContent = `[${capitalize(segment.type)}: Readable]`;

        readable.appendChild(label);
        readable.appendChild(document.createTextNode(` ${getSegmentDisplayName(segment.url)}`));

        readable.addEventListener('click', () => {
            fetch(segment.url)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
                    return res.text();
                })
                .then(text => {
                    updateBodyContent(text);
                    updateHeaderContent(`Readable version of ${segment.url}`);
                })
                .catch(err => {
                    console.error('Segment fetch error:', err);
                    updateHeaderContent(`Error: ${err.message}`);
                    updateBodyContent('Failed to load segment content');

                    // Notify UI that this segment is expired
                    const expiredEvent = new CustomEvent('segmentExpired', {
                        detail: { id: segment.id, url: segment.url }
                    });
                    document.dispatchEvent(expiredEvent);
                });

        });

        container.appendChild(readable);
    }


    time.textContent = prefix;

    const label = segment.title && segment.title !== 'no desc'
        ? segment.title
        : getSegmentDisplayName(segment.url);

    el.appendChild(time);
    el.appendChild(document.createTextNode(` ${label}`));
    el.addEventListener('click', () => selectSegment(segment));

    container.appendChild(el);
    if (state.isLive) container.scrollTop = container.scrollHeight;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function selectSegment(segment) {
    console.log(`Selected segment: ${segment.id}`);

    document.querySelectorAll('#metadataList div').forEach(el => el.classList.remove('selected'));
    const el = document.querySelector(`[data-segment-id="${segment.id}"]`);
    if (el) el.classList.add('selected');

    fetchSegmentDetails(segment);
}

function fetchSegmentDetails(segment) {
    updateHeaderContent('Fetching segment details...');
    updateBodyContent('Fetching segment content...');

    fetch(segment.url)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error ${res.status}`);
            const headers = [];
            res.headers.forEach((v, k) => headers.push(`${k}: ${v}`));
            updateHeaderContent(headers.join('\n'));
            return res.arrayBuffer();
        })
        .then(buffer => displaySegmentContent(buffer, segment))
        .catch(err => {
            console.error('Segment fetch error:', err);
            updateHeaderContent(`Error: ${err.message}`);
            updateBodyContent('Failed to load segment content');
        });
}

function displaySegmentContent(buffer, segment) {
    const mime = getMimeTypeFromUrl(segment.url);
    const details = [
        `Segment: ${getSegmentDisplayName(segment.url)}`,
        `Sequence: ${segment.sequence}`,
        `Size: ${buffer.byteLength} bytes`,
        `Type: ${mime}`,
        `Duration: ${segment.duration?.toFixed(2) || 'Unknown'}s`,
        '',
        formatHexDump(buffer)
    ];
    updateBodyContent(details.join('\n'));
}

function formatHexDump(buffer) {
    const bytes = new Uint8Array(buffer);
    const lines = [];

    for (let i = 0; i < bytes.length; i += 16) {
        const addr = i.toString(16).padStart(8, '0');
        const hex = [], ascii = [];

        for (let j = 0; j < 16; j++) {
            const b = bytes[i + j];
            if (b === undefined) {
                hex.push('  ');
                ascii.push(' ');
            } else {
                hex.push(b.toString(16).padStart(2, '0'));
                ascii.push(b >= 32 && b <= 126 ? String.fromCharCode(b) : '.');
            }
        }

        lines.push(`${addr}  ${hex.join(' ')}  |${ascii.join('')}|`);
    }

    return lines.join('\n');
}

function getMimeTypeFromUrl(url) {
    const ext = url.split('.').pop().toLowerCase();
    return {
        ts: 'video/MP2T',
        aac: 'audio/aac',
        mp4: 'video/mp4',
        m4s: 'video/mp4',
        m4a: 'audio/mp4',
        mp3: 'audio/mpeg',
        webm: 'video/webm',
        vtt: 'text/vtt',
        srt: 'text/srt'
    }[ext] || 'application/octet-stream';
}

function getSegmentDisplayName(url) {
    try {
        const parts = new URL(url).pathname.split('/');
        return parts[parts.length - 1] || 'Segment';
    } catch {
        return 'Segment';
    }
}

function resolveUrl(url, base) {
    // If it's already an absolute URL, return it as is
    if (/^(https?:)?\/\//.test(url)) {
        return url;
    }
    
    try {
        // Use the built-in URL constructor for proper URL resolution
        return new URL(url, base).href;
    } catch (e) {
        console.error('Error resolving URL:', e);
        
        // Fallback implementation
        const baseUrl = new URL(base);
        return url.startsWith('/')
            ? `${baseUrl.origin}${url}`
            : `${baseUrl.origin}${baseUrl.pathname.replace(/[^/]+$/, '')}${url}`;
    }
}

function updateHeaderContent(content) {
    const el = document.getElementById('headerContent');
    if (el) el.textContent = content;
}

function updateBodyContent(content) {
    const el = document.getElementById('bodyContent');
    if (el) el.textContent = content;
}

function updateStatus(msg) {
    const el = document.getElementById('statusBar');
    if (el) el.textContent = msg;
}

function setupUIHandlers() {
    document.querySelectorAll('.metadata_tab-buttonUpdate').forEach(button => {
        button.addEventListener('click', e => {
            const tab = e.target.getAttribute('data-tab');

            document.querySelectorAll('.metadata_tab-buttonUpdate').forEach(btn =>
                btn.classList.remove('active')
            );
            e.target.classList.add('active');

            document.querySelectorAll('.metadata_tab-paneUpdate, .metadata_tab-paneBodyUpdate').forEach(pane =>
                pane.classList.remove('active')
            );

            document.querySelector(`#${tab}-tabUpdate`)?.classList.add('active');
        });
    });

    const player = document.getElementById('hlsVideoPlayer');
    if (player) {
        player.addEventListener('timeupdate', () => {
            // Placeholder for segment highlighting logic
        });
    }
}

// ---- Hook Hls.js if available ----
document.addEventListener('hlsLoaded', e => {
    const hls = e.detail.hls;
    if (!hls) return;

    console.log('Hls.js detected');

    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) =>
        console.log('HLS.js Manifest parsed', data)
    );

    hls.on(Hls.Events.FRAG_LOADING, (_, data) =>
        console.log('HLS.js Fragment loading', data.frag.url)
    );
});

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

console.log('HLS Manifest Parser ready.');