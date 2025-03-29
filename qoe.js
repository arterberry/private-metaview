// qoe.js - Quality of Experience module for VIDINFRA MetaView

// QoE Data Structure
const qoeData = {
    // Timing metrics
    startTime: null,
    loadStart: null,
    firstFrame: null,
    
    // Quality metrics
    qualitySwitches: 0,
    currentBitrate: null,
    currentResolution: null,
    
    // Buffering metrics
    rebufferingEvents: 0,
    rebufferingDurations: [],
    lastRebufferStart: null,
    
    // Track information
    audioTracks: [],
    subtitleTracks: [],
    
    // Network metrics
    downloadSpeed: [],
    latency: [],
    throughput: [],
    
    // CDN information
    cdnProvider: "Unknown",
    
    // Event history
    eventHistory: [],
    
    // Calculated QoE score
    qoeScore: null,
    
    // Playback information
    playbackRate: 1,
    
    // Reset all metrics
    reset: function() {
        this.startTime = null;
        this.loadStart = null;
        this.firstFrame = null;
        this.qualitySwitches = 0;
        this.currentBitrate = null;
        this.currentResolution = null;
        this.rebufferingEvents = 0;
        this.rebufferingDurations = [];
        this.lastRebufferStart = null;
        this.audioTracks = [];
        this.subtitleTracks = [];
        this.downloadSpeed = [];
        this.latency = [];
        this.throughput = [];
        this.cdnProvider = "Unknown";
        this.eventHistory = [];
        this.qoeScore = null;
        this.playbackRate = 1;
        
        // Reset UI
        updateQoEDisplay();
    }
};

// Initialize QoE monitoring when DOM is loaded
document.addEventListener("DOMContentLoaded", function() {
    console.log("Initializing QoE module...");
    
    // Setup QoE details tabs
    setupQoEDetailsTabs();
    
    // Initialize QoE display
    updateQoEDisplay();
});

// Setup tab functionality within QoE panel
function setupQoEDetailsTabs() {
    const tabs = document.querySelectorAll('.qoe-details-tab');
    if (!tabs || tabs.length === 0) {
        console.warn("QoE tabs not found, skipping tab setup");
        return;
    }
    
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            // Deactivate all tabs and panels
            document.querySelectorAll('.qoe-details-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.qoe-details-panel').forEach(p => p.classList.remove('active'));
            
            // Activate clicked tab
            this.classList.add('active');
            
            // Activate corresponding panel
            const panelId = this.getAttribute('data-qoe-tab') + '-panel';
            const panel = document.getElementById(panelId);
            if (panel) {
                panel.classList.add('active');
            }
        });
    });
}

// Function to initialize QoE monitoring when playback starts
function initQoEMonitoring(video, hls) {
    console.log("Starting QoE monitoring...");
    
    // Reset existing data
    qoeData.reset();
    
    // Record start time when initializing
    qoeData.startTime = performance.now();
    
    // Add video element event listeners
    if (video) {
        // Timing events
        video.addEventListener('loadstart', onLoadStart);
        video.addEventListener('loadeddata', onLoadedData);
        video.addEventListener('canplay', onCanPlay);
        
        // Buffering events
        video.addEventListener('waiting', onWaiting);
        video.addEventListener('playing', onPlaying);
        
        // Playback events
        video.addEventListener('ratechange', onRateChange);
        
        // Error events
        video.addEventListener('error', onVideoError);
    }
    
    // Add HLS.js specific event listeners
    if (hls) {
        // Level switching events (quality changes)
        hls.on(Hls.Events.LEVEL_SWITCHED, onLevelSwitched);
        
        // Manifest parsing for tracks
        hls.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
        
        // Fragment loading for network metrics
        hls.on(Hls.Events.FRAG_LOADING, onFragmentLoading);
        hls.on(Hls.Events.FRAG_LOADED, onFragmentLoaded);
        
        // Error tracking
        hls.on(Hls.Events.ERROR, onHlsError);
    }
    
    // Add event to history
    addQoEEvent("Stream playback initiated");
}

// Video Event Handlers
function onLoadStart() {
    qoeData.loadStart = performance.now();
    addQoEEvent("Video loading started");
}

function onLoadedData() {
    if (!qoeData.firstFrame) {
        qoeData.firstFrame = performance.now();
        const timeToFirstFrame = ((qoeData.firstFrame - qoeData.startTime) / 1000).toFixed(2);
        addQoEEvent(`First frame displayed after ${timeToFirstFrame}s`);
        
        // Update UI
        updateQoEDisplay();
    }
}

function onCanPlay() {
    // If this is the first canplay event
    if (qoeData.loadStart && !document.getElementById('startupTime').innerText.includes('s')) {
        const startupTime = ((performance.now() - qoeData.loadStart) / 1000).toFixed(2);
        addQoEEvent(`Video startup completed in ${startupTime}s`, 'startup');
        
        // Update UI
        updateQoEDisplay();
    }
}

function onWaiting() {
    // Record the start of a rebuffering event
    qoeData.lastRebufferStart = performance.now();
    addQoEEvent("Buffering started", "rebuffer");
    
    // Update UI
    updateQoEDisplay();
}

function onPlaying() {
    // If we were rebuffering, record the end of the rebuffering event
    if (qoeData.lastRebufferStart) {
        const rebufferDuration = (performance.now() - qoeData.lastRebufferStart) / 1000;
        qoeData.rebufferingEvents++;
        qoeData.rebufferingDurations.push(rebufferDuration);
        
        addQoEEvent(`Buffering ended after ${rebufferDuration.toFixed(2)}s`, "rebuffer");
        qoeData.lastRebufferStart = null;
        
        // Update UI
        updateQoEDisplay();
    }
}

function onRateChange(e) {
    const video = e.target;
    qoeData.playbackRate = video.playbackRate;
    addQoEEvent(`Playback rate changed to ${qoeData.playbackRate}x`);
    
    // Update UI
    updateQoEDisplay();
}

function onVideoError(e) {
    addQoEEvent(`Video playback error: ${e.target.error ? e.target.error.message : 'Unknown error'}`, "error");
    
    // Update UI
    updateQoEDisplay();
}

// HLS.js Event Handlers
function onLevelSwitched(event, data) {
    qoeData.qualitySwitches++;
    
    // Get information about the new level
    const hlsInstance = this; // 'this' should refer to the HLS instance
    if (hlsInstance && hlsInstance.levels && data.level < hlsInstance.levels.length) {
        const level = hlsInstance.levels[data.level];
        qoeData.currentBitrate = level.bitrate;
        qoeData.currentResolution = `${level.width}x${level.height}`;
        
        addQoEEvent(`Quality changed to ${qoeData.currentResolution} (${Math.round(qoeData.currentBitrate/1000)} kbps)`, "quality-change");
    } else {
        addQoEEvent(`Quality level changed to level ${data.level}`, "quality-change");
    }
    
    // Update UI
    updateQoEDisplay();
}

function onManifestParsed(event, data) {
    // Extract audio tracks
    if (data.audioTracks && data.audioTracks.length > 0) {
        qoeData.audioTracks = data.audioTracks.map(track => ({
            id: track.id,
            name: track.name,
            language: track.lang || 'Unknown',
            codec: track.audioCodec || 'Unknown',
            default: track.default || false
        }));
        
        addQoEEvent(`Detected ${qoeData.audioTracks.length} audio tracks`);
    }
    
    // Extract subtitle tracks if available
    if (data.subtitles && data.subtitles.length > 0) {
        qoeData.subtitleTracks = data.subtitles.map(track => ({
            id: track.id,
            name: track.name,
            language: track.lang || 'Unknown',
            default: track.default || false
        }));
        
        addQoEEvent(`Detected ${qoeData.subtitleTracks.length} subtitle tracks`);
    }
    
    // Update UI
    updateQoEDisplay();
}

// Fragment loading measurements for network performance
let fragmentLoadingData = {};

function onFragmentLoading(event, data) {
    if (data.frag) {
        // Store fragment loading start time
        fragmentLoadingData[data.frag.sn] = {
            startTime: performance.now(),
            url: data.frag.url
        };
    }
}

function onFragmentLoaded(event, data) {
    if (data.frag && fragmentLoadingData[data.frag.sn]) {
        const fragInfo = fragmentLoadingData[data.frag.sn];
        const loadTime = performance.now() - fragInfo.startTime;
        const loadSizeBytes = data.stats.total;
        const throughputBps = loadSizeBytes * 8 / (loadTime / 1000);
        
        // Store network metrics
        qoeData.throughput.push(throughputBps);
        qoeData.downloadSpeed.push(loadSizeBytes / (loadTime / 1000));
        
        // Only keep last 10 measurements for averages
        if (qoeData.throughput.length > 10) {
            qoeData.throughput.shift();
            qoeData.downloadSpeed.shift();
        }
        
        // Try to detect CDN from URL or headers if available
        detectCDN(fragInfo.url, data.stats.headers);
        
        // Clean up
        delete fragmentLoadingData[data.frag.sn];
        
        // Update UI
        updateQoEDisplay();
    }
}

function onHlsError(event, data) {
    addQoEEvent(`HLS error: ${data.details}`, "error");
    
    // Update UI
    updateQoEDisplay();
}

// CDN detection based on URL patterns and headers
function detectCDN(url, headers) {
    if (qoeData.cdnProvider !== "Unknown") {
        // We already detected the CDN
        return;
    }
    
    // Check URL patterns first
    if (url) {
        if (url.includes('akamai') || url.includes('akadns') || url.includes('akamaiedge')) {
            qoeData.cdnProvider = "Akamai";
        } else if (url.includes('cloudfront.net')) {
            qoeData.cdnProvider = "AWS CloudFront";
        } else if (url.includes('cdn.cloudflare.net') || url.includes('cdnjs.cloudflare')) {
            qoeData.cdnProvider = "Cloudflare";
        } else if (url.includes('fastly.net') || url.includes('fastlylb.net')) {
            qoeData.cdnProvider = "Fastly";
        } else if (url.includes('cdn.jsdelivr.net')) {
            qoeData.cdnProvider = "jsDelivr";
        } else if (url.includes('llnwd.net')) {
            qoeData.cdnProvider = "Limelight";
        } else if (url.includes('edgecast') || url.includes('systemcdn.net')) {
            qoeData.cdnProvider = "Edgecast";
        } else if (url.includes('footprint.net')) {
            qoeData.cdnProvider = "CenturyLink";
        }
    }
    
    // Check headers if available
    if (headers) {
        // Look for specific CDN headers
        if (headers['x-amz-cf-id'] || headers['x-amz-cf-pop']) {
            qoeData.cdnProvider = "AWS CloudFront";
        } else if (headers['x-cdn-provider'] === 'akamai' || headers['x-akamai-staging']) {
            qoeData.cdnProvider = "Akamai";
        } else if (headers['cf-ray'] || headers['cf-cache-status']) {
            qoeData.cdnProvider = "Cloudflare";
        } else if (headers['x-served-by'] && headers['x-served-by'].includes('cache-')) {
            qoeData.cdnProvider = "Fastly";
        } else if (headers['x-cache'] && headers['x-edge-location']) {
            // Generic but commonly used by multiple CDNs
            if (qoeData.cdnProvider === "Unknown") {
                qoeData.cdnProvider = "CDN Detected";
            }
        }
    }
    
    if (qoeData.cdnProvider !== "Unknown") {
        addQoEEvent(`CDN identified: ${qoeData.cdnProvider}`);
    }
}

// Function to add events to the QoE event history
function addQoEEvent(message, type = "") {
    const event = {
        timestamp: new Date(),
        message: message,
        type: type
    };
    
    qoeData.eventHistory.push(event);
    
    // Limit history size to 100 events
    if (qoeData.eventHistory.length > 100) {
        qoeData.eventHistory.shift();
    }
    
    // Update the event history display if element exists
    const historyElement = document.getElementById('qoeEventHistory');
    if (historyElement) {
        // Clear empty placeholder if it exists
        const emptyHistory = historyElement.querySelector('.qoe-empty-history');
        if (emptyHistory) {
            historyElement.removeChild(emptyHistory);
        }
        
        // Create and add the new event element
        const eventElement = document.createElement('div');
        eventElement.className = `qoe-history-event ${type ? 'event-' + type : ''}`;
        
        const timestamp = document.createElement('span');
        timestamp.className = 'qoe-history-timestamp';
        timestamp.textContent = `[${event.timestamp.toLocaleTimeString()}]`;
        
        eventElement.appendChild(timestamp);
        eventElement.appendChild(document.createTextNode(' ' + event.message));
        
        // Add to the top of the list
        if (historyElement.firstChild) {
            historyElement.insertBefore(eventElement, historyElement.firstChild);
        } else {
            historyElement.appendChild(eventElement);
        }
    }
    
    // Also log to console for debugging
    console.log(`QoE Event [${type || 'info'}]: ${message}`);
}

// Calculate the QoE score based on all metrics
function calculateQoEScore() {
    // If we don't have basic data yet, return null
    if (!qoeData.firstFrame) {
        return null;
    }
    
    // Base score starts at 100
    let score = 100;
    
    // Penalty for slow startup time
    if (qoeData.loadStart && qoeData.firstFrame) {
        const startupTime = (qoeData.firstFrame - qoeData.loadStart) / 1000;
        // Penalize 5 points for each second of startup time over 1 second
        if (startupTime > 1) {
            score -= Math.min(30, Math.floor((startupTime - 1) * 5));
        }
    }
    
    // Penalty for rebuffering
    if (qoeData.rebufferingEvents > 0) {
        // Each rebuffering event costs 5 points
        score -= Math.min(30, qoeData.rebufferingEvents * 5);
        
        // Additional penalty for long rebuffering
        if (qoeData.rebufferingDurations.length > 0) {
            const totalRebufferTime = qoeData.rebufferingDurations.reduce((sum, duration) => sum + duration, 0);
            // Each second of rebuffering costs 3 additional points
            score -= Math.min(30, Math.floor(totalRebufferTime * 3));
        }
    }
    
    // Penalty for many quality switches (too much switching is jarring)
    if (qoeData.qualitySwitches > 3) {
        // Excessive switching (beyond the first 3) costs 1 point each
        score -= Math.min(10, qoeData.qualitySwitches - 3);
    }
    
    // Bonus for high bitrate/resolution - if we know the current bitrate
    if (qoeData.currentBitrate) {
        const bitrateMbps = qoeData.currentBitrate / 1000000;
        // Add up to 5 bonus points for high bitrate
        if (bitrateMbps >= 5) {
            score += 5; // 5+ Mbps is excellent quality
        } else if (bitrateMbps >= 2) {
            score += 3; // 2-5 Mbps is good quality
        } else if (bitrateMbps >= 1) {
            score += 1; // 1-2 Mbps is acceptable
        }
    }
    
    // Clamp the score between 0 and 100
    return Math.max(0, Math.min(100, Math.round(score)));
}

// Update the QoE display with current data
function updateQoEDisplay() {
    // Calculate QoE score
    qoeData.qoeScore = calculateQoEScore();
    
    // Update score display
    const scoreValue = document.getElementById('qoeScoreValue');
    const scoreFill = document.getElementById('qoeScoreFill');
    
    if (scoreValue && scoreFill) {
        if (qoeData.qoeScore !== null) {
            scoreValue.textContent = qoeData.qoeScore;
            scoreFill.style.width = `${qoeData.qoeScore}%`;
            
            // Update fill color based on score
            scoreFill.className = 'qoe-score-fill';
            if (qoeData.qoeScore < 60) {
                scoreFill.classList.add('poor');
            } else if (qoeData.qoeScore < 75) {
                scoreFill.classList.add('fair');
            } else if (qoeData.qoeScore < 90) {
                scoreFill.classList.add('good');
            } else {
                scoreFill.classList.add('excellent');
            }
        } else {
            scoreValue.textContent = 'N/A';
            scoreFill.style.width = '0%';
        }
    }
    
    // Update metrics
    updateElement('cdnProvider', qoeData.cdnProvider);
    
    // Calculate and display startup time
    if (qoeData.loadStart && qoeData.firstFrame) {
        const startupTime = ((qoeData.firstFrame - qoeData.loadStart) / 1000).toFixed(2);
        updateElement('startupTime', `${startupTime}s`);
    }
    
    // Calculate and display time to first frame
    if (qoeData.startTime && qoeData.firstFrame) {
        const ttff = ((qoeData.firstFrame - qoeData.startTime) / 1000).toFixed(2);
        updateElement('timeToFirstFrame', `${ttff}s`);
    }
    
    // Update quality switches
    updateElement('qualitySwitches', qoeData.qualitySwitches);
    
    // Update rebuffering events
    updateElement('rebufferingEvents', qoeData.rebufferingEvents);
    
    // Calculate average rebuffer duration
    if (qoeData.rebufferingDurations.length > 0) {
        const avgDuration = qoeData.rebufferingDurations.reduce((sum, val) => sum + val, 0) / 
                           qoeData.rebufferingDurations.length;
        updateElement('avgRebufferDuration', `${avgDuration.toFixed(2)}s`);
    }
    
    // Update current bitrate
    if (qoeData.currentBitrate) {
        const bitrateMbps = (qoeData.currentBitrate / 1000000).toFixed(2);
        updateElement('currentBitrate', `${bitrateMbps} Mbps`);
    }
    
    // Update playback rate
    updateElement('playbackRate', `${qoeData.playbackRate}x`);
    
    // Update audio tracks display
    updateAudioTracksDisplay();
    
    // Update subtitles display
    updateSubtitlesDisplay();
    
    // Update connection metrics
    updateConnectionMetrics();
}

// Helper function to update an element's text content
function updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

// Update audio tracks display
function updateAudioTracksDisplay() {
    const container = document.getElementById('audioTracksContainer');
    if (!container) return;
    
    if (qoeData.audioTracks.length === 0) {
        container.textContent = "No audio track information available";
        return;
    }
    
    // Clear container
    container.innerHTML = "";
    
    // Add each audio track
    qoeData.audioTracks.forEach((track, index) => {
        const trackElement = document.createElement('div');
        trackElement.className = 'audio-track-item';
        
        let trackInfo = `${index + 1}. ${track.name || 'Track ' + (index + 1)}`;
        trackInfo += ` (${track.language})`;
        
        if (track.codec !== 'Unknown') {
            trackInfo += ` - Codec: ${track.codec}`;
        }
        
        if (track.default) {
            trackInfo += ` [Default]`;
        }
        
        trackElement.textContent = trackInfo;
        container.appendChild(trackElement);
    });
}

// Update subtitles display
function updateSubtitlesDisplay() {
    const container = document.getElementById('subtitlesContainer');
    if (!container) return;
    
    if (qoeData.subtitleTracks.length === 0) {
        container.textContent = "No subtitle information available";
        return;
    }
    
    // Clear container
    container.innerHTML = "";
    
    // Add each subtitle track
    qoeData.subtitleTracks.forEach((track, index) => {
        const trackElement = document.createElement('div');
        trackElement.className = 'subtitle-track-item';
        
        let trackInfo = `${index + 1}. ${track.name || 'Subtitle ' + (index + 1)}`;
        trackInfo += ` (${track.language})`;
        
        if (track.default) {
            trackInfo += ` [Default]`;
        }
        
        trackElement.textContent = trackInfo;
        container.appendChild(trackElement);
    });
}

// Update connection metrics
function updateConnectionMetrics() {
    // Calculate average throughput
    if (qoeData.throughput.length > 0) {
        const avgThroughput = qoeData.throughput.reduce((sum, val) => sum + val, 0) / 
                            qoeData.throughput.length;
        const throughputMbps = (avgThroughput / 1000000).toFixed(2);
        updateElement('tcpThroughput', `${throughputMbps} Mbps`);
    }
    
    // Calculate average download speed
    if (qoeData.downloadSpeed.length > 0) {
        const avgSpeed = qoeData.downloadSpeed.reduce((sum, val) => sum + val, 0) / 
                        qoeData.downloadSpeed.length;
        
        let speedText;
        if (avgSpeed >= 1000000) {
            speedText = `${(avgSpeed / 1000000).toFixed(2)} MB/s`;
        } else {
            speedText = `${(avgSpeed / 1000).toFixed(2)} KB/s`;
        }
        
        updateElement('downloadSpeed', speedText);
    }
    
    // Update connection type if available
    if (navigator.connection) {
        updateElement('connectionType', navigator.connection.effectiveType || 'Unknown');
    }
}

// Make QoE module available globally
window.qoeModule = {
    initQoEMonitoring: initQoEMonitoring,
    qoeData: qoeData,
    addQoEEvent: addQoEEvent,
    updateQoEDisplay: updateQoEDisplay
};