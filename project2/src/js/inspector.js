// inspector.js

// Cache Inspector
window.CacheInspector = (function () {
    const cacheData = {
        hits: 0,
        misses: 0,
        total: 0,
        history: [],
        maxHistory: 20
    };

    function initGraph() {
        const canvas = document.getElementById('cacheHitMissGraph');
        if (!canvas || !canvas.getContext) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw baseline
        ctx.beginPath();
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();

        addGraphLabels();
    }

    function addGraphLabels() {
        const container = document.querySelector('.cache-graph-container');
        if (!container) return;

        container.querySelectorAll('.graph-label').forEach(el => el.remove());

        const hit = document.createElement('div');
        hit.className = 'graph-label hit-label';
        hit.textContent = 'HIT';

        const miss = document.createElement('div');
        miss.className = 'graph-label miss-label';
        miss.textContent = 'MISS';

        container.appendChild(hit);
        container.appendChild(miss);
    }

    function updateGraph(isHit) {
        if (isHit) cacheData.hits++;
        else cacheData.misses++;
        cacheData.total++;

        cacheData.history.push(isHit ? 1 : 0);
        if (cacheData.history.length > cacheData.maxHistory) cacheData.history.shift();

        drawGraph();

        const hitRatio = (cacheData.hits / cacheData.total * 100).toFixed(1);
        document.getElementById('hitRatio').textContent = `Hit Ratio: ${hitRatio}%`;
        document.getElementById('segmentCount').textContent = `Segments: ${cacheData.total}`;
    }

    function drawGraph() {
        const canvas = document.getElementById('cacheHitMissGraph');
        if (!canvas || !canvas.getContext || cacheData.history.length === 0) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);

        ctx.beginPath();
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        addGraphLabels();

        const step = (width - 40) / (cacheData.history.length - 1);
        ctx.beginPath();
        ctx.strokeStyle = '#2196F3';
        ctx.lineWidth = 1;

        cacheData.history.forEach((val, i) => {
            const x = 30 + (i * step);
            const y = val === 1 ? height * 0.25 : height * 0.75;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });

        ctx.stroke();

        cacheData.history.forEach((val, i) => {
            const x = 30 + (i * step);
            const y = val === 1 ? height * 0.25 : height * 0.75;
            ctx.beginPath();
            ctx.fillStyle = val === 1 ? '#4CAF50' : '#F44336';
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function simulateSegmentLoad(headers = {}) {
        const isHit = determineCacheHit(headers);
        updateGraph(isHit);
    }

    function determineCacheHit(headers) {
        const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
        const xCache = lower['x-cache'] || lower['cf-cache-status'] || '';
        const age = parseInt(lower['age'] || '0');

        return xCache.includes('hit') || age > 0;
    }

    return {
        initGraph,
        updateGraph,
        simulateSegmentLoad,
        determineCacheHit
    };
})();

// SCTE-35 Inspector
window.SCTEInspector = (function () {
    const scteMarkers = [];

    function handleMarkers(parsedArray) {
        parsedArray.forEach((marker, index) => {
            scteMarkers.push(marker);
            renderScteMarker(marker);
            renderScteDetail(marker);
        });

        updateStats();
        showDetailSection();
    }

    function renderScteMarker(marker) {
        const display = document.getElementById('scteDisplay');
        if (!display) return;

        const markerEl = document.createElement('div');
        markerEl.className = `scte-marker ${marker.type === 'ad' ? 'ad-marker' : 'content-marker'}`;
        markerEl.textContent = `${marker.type.toUpperCase()} - PID ${marker.pid}`;
        display.appendChild(markerEl);
    }

    function renderScteDetail(marker) {
        const container = document.getElementById('scteDetailContainer');
        if (!container) return;

        const detail = document.createElement('div');
        detail.className = 'scte-detail-entry';
        detail.innerHTML = `
            <div><strong>Type:</strong> ${marker.type}</div>
            <div><strong>PID:</strong> ${marker.pid}</div>
            <div><strong>Timestamp:</strong> ${new Date().toLocaleTimeString()}</div>
            <pre>${JSON.stringify(marker, null, 2)}</pre>
        `;

        container.appendChild(detail);
    }

    function updateStats() {
        const adCount = scteMarkers.filter(m => m.type === 'ad').length;
        const adRatio = ((adCount / scteMarkers.length) * 100).toFixed(1);

        document.getElementById('adRatio').textContent = `Ad Ratio: ${adRatio}%`;
        document.getElementById('adCount').textContent = `Ads: ${adCount}`;
    }

    function showDetailSection() {
        const section = document.getElementById('scteDetailSection');
        if (section) {
            section.style.display = 'block';
        }
    }

    return {
        handleMarkers
    };
})();

// Resolutions
window.ResolutionAnalyzer = {
    async fetchResolutions(manifestUrl) {
        try {
            const response = await fetch(manifestUrl);
            const text = await response.text();
            return this.extractResolutions(text);
        } catch (err) {
            console.error("ResolutionAnalyzer: Failed to fetch manifest", err);
            return [];
        }
    },

    extractResolutions(manifestText) {
        const resolutions = [];
        const lines = manifestText.split('\n');
        lines.forEach(line => {
            if (line.includes('#EXT-X-STREAM-INF:') && line.includes('RESOLUTION=')) {
                const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
                const bwMatch = line.match(/BANDWIDTH=(\d+)/);
                if (resMatch) {
                    resolutions.push({
                        resolution: resMatch[1],
                        bandwidth: bwMatch ? `${Math.round(parseInt(bwMatch[1]) / 1000)} kbps` : 'unknown'
                    });
                }
            }
        });
        return resolutions;
    },

    renderToDOM(resolutions, containerId = 'resolutionList') {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        if (resolutions.length === 0) {
            container.innerHTML = '<div>No resolution variants found</div>';
            return;
        }
        resolutions.forEach((entry, i) => {
            const div = document.createElement('div');
            div.className = 'resolution-item';
            div.textContent = `${i + 1}. Resolution: ${entry.resolution}, Bandwidth: ${entry.bandwidth}`;
            container.appendChild(div);
        });
    }
};

// Cache-Control Parser
window.parseTTLFromHeaders = function(headers) {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const cacheControl = lower['cache-control'] || '';
    const expires = lower['expires'] || '';

    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
    if (maxAgeMatch) {
        return `max-age=${maxAgeMatch[1]}s`;
    }

    if (expires) {
        return `expires: ${expires}`;
    }

    return null;
};

// Unified Initialization
function initializeInspector(manifestUrl) {
    if (window.CacheInspector) {
        window.CacheInspector.initGraph();
    }

    if (manifestUrl && window.ResolutionAnalyzer) {
        window.ResolutionAnalyzer.fetchResolutions(manifestUrl).then(res =>
            window.ResolutionAnalyzer.renderToDOM(res)
        );
    }
}


// Expose globally
window.initializeInspector = initializeInspector;
