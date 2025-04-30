// js/ui/qoe_ui.js

console.log('[qoe_ui] Initializing QoE UI…');

(function () {

    console.log('QoE init')
    
    // QoE state
    const qoeData = {
        startTime: null,
        loadStart: null,
        firstFrame: null,
        qualitySwitches: 0,
        currentBitrate: null,
        currentResolution: null,
        rebufferingEvents: 0,
        rebufferingDurations: [],
        lastRebufferStart: null,
        audioTracks: [],
        subtitleTracks: [],
        downloadSpeed: [],
        throughput: [],
        latency: [],
        cdnProvider: 'Unknown',
        playbackRate: 1,
        eventHistory: []
    };

    let fragmentLoadingData = {};

    document.addEventListener('DOMContentLoaded', () => {
        setupDetailTabs();
        hookVideoAndHls();
        updateQoEDisplay();
    });

    // -----------------------
    // Tab switching (Audio/Subs/Connection)
    // -----------------------
    function setupDetailTabs() {
        const tabs = document.querySelector('.qoe-details-tabs');
        if (!tabs) return;
        tabs.addEventListener('click', e => {
            const btn = e.target.closest('.qoe-details-tab');
            if (!btn) return;
            // deactivate
            tabs.querySelectorAll('.qoe-details-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.qoe-details-panel').forEach(p => p.classList.remove('active'));
            // activate
            btn.classList.add('active');
            const panel = document.getElementById(btn.dataset.qoeTab + '-panel');
            if (panel) panel.classList.add('active');
        });
    }

    // -----------------------
    // Attach video + Hls.js listeners
    // -----------------------
    function hookVideoAndHls() {
        const video = document.getElementById('hlsVideoPlayer');
        const hls = window.hlsPlayerInstance;

        if (video) {
            qoeData.startTime = performance.now();
            video.addEventListener('loadstart', () => {
                qoeData.loadStart = performance.now();
                addEvent('Video loadstart');
                updateQoEDisplay();
            });
            video.addEventListener('loadeddata', () => {
                if (!qoeData.firstFrame) {
                    qoeData.firstFrame = performance.now();
                    addEvent(`First frame after ${((qoeData.firstFrame - qoeData.startTime) / 1000).toFixed(2)}s`);
                    updateQoEDisplay();
                }
            });
            video.addEventListener('waiting', () => {
                qoeData.lastRebufferStart = performance.now();
                addEvent('Buffering start', 'rebuffer');
                updateQoEDisplay();
            });
            video.addEventListener('playing', () => {
                if (qoeData.lastRebufferStart) {
                    const d = (performance.now() - qoeData.lastRebufferStart) / 1000;
                    qoeData.rebufferingEvents++;
                    qoeData.rebufferingDurations.push(d);
                    addEvent(`Buffering end after ${d.toFixed(2)}s`, 'rebuffer');
                    qoeData.lastRebufferStart = null;
                    updateQoEDisplay();
                }
            });
            video.addEventListener('ratechange', () => {
                qoeData.playbackRate = video.playbackRate;
                addEvent(`Rate changed to ${video.playbackRate}x`);
                updateQoEDisplay();
            });
        }

        if (hls) {
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                // nothing here
            });
            hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
                qoeData.qualitySwitches++;
                const lvl = hls.levels[data.level];
                qoeData.currentBitrate = lvl.bitrate;
                qoeData.currentResolution = `${lvl.width}x${lvl.height}`;
                addEvent(`Quality → ${qoeData.currentResolution}`, 'quality-change');
                updateQoEDisplay();
            });
            hls.on(Hls.Events.FRAG_LOADING, (_, data) => {
                fragmentLoadingData[data.frag.sn] = { start: performance.now(), url: data.frag.url };
            });
            hls.on(Hls.Events.FRAG_LOADED, (_, data) => {
                const info = fragmentLoadingData[data.frag.sn];
                if (info) {
                    const loadMs = performance.now() - info.start;
                    const bytes = data.stats.total;
                    qoeData.throughput.push(bytes * 8 / (loadMs / 1000));
                    qoeData.downloadSpeed.push(bytes / (loadMs / 1000));
                    detectCDN(info.url, data.stats.headers);
                    delete fragmentLoadingData[data.frag.sn];
                    updateQoEDisplay();
                }
            });
            hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
                if (data.audioTracks) {
                    qoeData.audioTracks = data.audioTracks.map(t => ({
                        name: t.name, language: t.lang || '?', default: !!t.default, codec: t.audioCodec || '?'
                    }));
                    addEvent(`Detected ${qoeData.audioTracks.length} audio track(s)`);
                }
                if (data.subtitles) {
                    qoeData.subtitleTracks = data.subtitles.map(t => ({
                        name: t.name, language: t.lang || '?', default: !!t.default
                    }));
                    addEvent(`Detected ${qoeData.subtitleTracks.length} subtitle(s)`);
                }
                updateQoEDisplay();
            });
            hls.on(Hls.Events.ERROR, (_, data) => {
                addEvent(`HLS Error: ${data.details}`, 'error');
                updateQoEDisplay();
            });
        }
    }

    // -----------------------
    // Event history
    // -----------------------
    function addEvent(msg, type = '') {
        const ev = { time: new Date(), msg, type };
        qoeData.eventHistory.unshift(ev);
        if (qoeData.eventHistory.length > 100) qoeData.eventHistory.pop();
        renderHistory();
    }

    function renderHistory() {
        const container = document.getElementById('qoeEventHistory');
        if (!container) return;
        container.innerHTML = '';
        if (qoeData.eventHistory.length === 0) {
            container.innerHTML = '<div class="qoe-empty-history">No events recorded yet</div>';
            return;
        }
        qoeData.eventHistory.forEach(ev => {
            const div = document.createElement('div');
            div.className = 'qoe-history-event' + (ev.type ? ' event-' + ev.type : '');
            div.innerHTML = `<span class="qoe-history-timestamp">[${ev.time.toLocaleTimeString()}]</span> ${ev.msg}`;
            container.appendChild(div);
        });
    }

    // -----------------------
    // CDN detection
    // -----------------------
    function detectCDN(url, headers = {}) {
        if (qoeData.cdnProvider !== 'Unknown') return;
        let cdn = 'Unknown';
        const u = url.toLowerCase();
        if (u.includes('cloudfront')) cdn = 'CloudFront';
        else if (u.includes('akamai')) cdn = 'Akamai';
        else if (u.includes('cloudflare')) cdn = 'Cloudflare';
        else if (u.includes('fastly')) cdn = 'Fastly';
        else if (u.includes('qwilt')) cdn = 'Qwilt';
        if (headers['cf-cache-status']) cdn = 'Cloudflare';
        if (cdn !== 'Unknown') {
            qoeData.cdnProvider = cdn;
            addEvent(`CDN: ${cdn}`);
        }
    }

    // -----------------------
    // QoE score calculation
    // -----------------------
    function calculateQoE() {
        if (!qoeData.firstFrame) return null;
        let score = 100;
        // startup penalty
        if (qoeData.loadStart) {
            const st = (qoeData.firstFrame - qoeData.loadStart) / 1000;
            if (st > 1) score -= Math.min(30, Math.floor((st - 1) * 5));
        }
        // rebuffering penalty
        if (qoeData.rebufferingEvents) {
            score -= Math.min(30, qoeData.rebufferingEvents * 5);
            const total = qoeData.rebufferingDurations.reduce((a, b) => a + b, 0);
            score -= Math.min(30, Math.floor(total * 3));
        }
        // quality switches penalty
        if (qoeData.qualitySwitches > 3) score -= Math.min(10, qoeData.qualitySwitches - 3);
        // bitrate bonus
        if (qoeData.currentBitrate) {
            const mb = qoeData.currentBitrate / 1e6;
            if (mb >= 5) score += 5;
            else if (mb >= 2) score += 3;
            else if (mb >= 1) score += 1;
        }
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    // -----------------------
    // Update all pieces of the UI
    // -----------------------
    function updateQoEDisplay() {
        // score
        const score = calculateQoE();
        const val = document.getElementById('qoeScoreValue');
        const fill = document.getElementById('qoeScoreFill');
        if (val && fill) {
            if (score !== null) {
                val.textContent = score;
                fill.style.width = score + '%';
                fill.className = 'qoe-score-fill';
                if (score < 60) fill.classList.add('poor');
                else if (score < 75) fill.classList.add('fair');
                else if (score < 90) fill.classList.add('good');
                else fill.classList.add('excellent');
            } else {
                val.textContent = 'N/A';
                fill.style.width = '0%';
            }
        }

        // metrics rows
        const rows = [
            ['cdnProvider', qoeData.cdnProvider],
            ['startupTime', qoeData.loadStart && qoeData.firstFrame ? ((qoeData.firstFrame - qoeData.loadStart) / 1000).toFixed(2) + 's' : 'N/A'],
            ['timeToFirstFrame', qoeData.startTime && qoeData.firstFrame ? ((qoeData.firstFrame - qoeData.startTime) / 1000).toFixed(2) + 's' : 'N/A'],
            ['qualitySwitches', qoeData.qualitySwitches],
            ['rebufferingEvents', qoeData.rebufferingEvents],
            ['avgRebufferDuration', qoeData.rebufferingDurations.length ?
                (qoeData.rebufferingDurations.reduce((a, b) => a + b, 0) / qoeData.rebufferingDurations.length).toFixed(2) + 's' : 'N/A'],
            ['currentBitrate', qoeData.currentBitrate ? (qoeData.currentBitrate / 1e6).toFixed(2) + ' Mbps' : 'N/A'],
            ['playbackRate', qoeData.playbackRate + 'x']
        ];
        rows.forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        });

        renderAudio();
        renderSubs();
        renderConnection();
    }

    function renderAudio() {
        const c = document.getElementById('audioTracksContainer');
        if (!c) return;
        if (!qoeData.audioTracks.length) c.textContent = 'No audio track information available';
        else {
            c.innerHTML = '';
            qoeData.audioTracks.forEach((t, i) => {
                const d = document.createElement('div');
                d.className = 'audio-track-item';
                d.textContent = `${i + 1}. ${t.name || 'Track'} (${t.language})${t.default ? ' [Default]' : ''}` + (t.codec ? ` - ${t.codec}` : '');
                c.appendChild(d);
            });
        }
    }

    function renderSubs() {
        const c = document.getElementById('subtitlesContainer');
        if (!c) return;
        if (!qoeData.subtitleTracks.length) c.textContent = 'No subtitle information available';
        else {
            c.innerHTML = '';
            qoeData.subtitleTracks.forEach((t, i) => {
                const d = document.createElement('div');
                d.className = 'subtitle-track-item';
                d.textContent = `${i + 1}. ${t.name || 'Subtitle'} (${t.language})${t.default ? ' [Default]' : ''}`;
                c.appendChild(d);
            });
        }
    }

    function renderConnection() {
        // throughput
        if (qoeData.throughput.length) {
            const avg = qoeData.throughput.reduce((a, b) => a + b, 0) / qoeData.throughput.length;
            document.getElementById('tcpThroughput').textContent = (avg / 1e6).toFixed(2) + ' Mbps';
        }
        // download speed
        if (qoeData.downloadSpeed.length) {
            const avg = qoeData.downloadSpeed.reduce((a, b) => a + b, 0) / qoeData.downloadSpeed.length;
            const txt = avg >= 1e6 ? (avg / 1e6).toFixed(2) + ' MB/s' : (avg / 1e3).toFixed(2) + ' KB/s';
            document.getElementById('downloadSpeed').textContent = txt;
        }
        // connection type
        if (navigator.connection) {
            document.getElementById('connectionType').textContent = navigator.connection.effectiveType || 'N/A';
        }
    }

})();
