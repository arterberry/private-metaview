// js/core/data_manager.js
// This file contains the DataManager class, which is responsible for managing
// the data in the application. It handles loading, saving, and processing data.
// It also provides methods for accessing and manipulating the data.


console.log('[DataManager] Initializing...');

class DataManager {
    constructor(config = {}) {
        console.log('[DataManager] Constructor called');

        // --- Configuration ---
        this.config = {
            maxEventLogSize: config.maxEventLogSize || 200, // Max events to keep
            maxMetricHistorySize: config.maxMetricHistorySize || 150, // Max entries per metric history (e.g., ~10 mins if 4s segments)
            // Add other config options as needed
        };

        // --- Internal Data Storage ---
        this.sessionInfo = {
            streamUrl: null,
            startTime: Date.now(), // Record session start time
            detectedCDN: 'Unknown',
            initialAudioCodec: '?',
            initialResolution: null,
            availableResolutions: [],
            availableAudioTracks: [],
            availableSubtitleTracks: [],
            userAgent: navigator.userAgent, // Store user agent
        };

        this.currentState = {
            currentBitrate: null,
            currentResolution: null,
            currentBufferLevel: null, // Will need a way to poll this
            currentLatency: null, // Avg frag latency
            isBuffering: false,
            playbackRate: 1,
            currentAudioTrackId: null,
            currentAudioCodec: '?', // Redundant with sessionInfo? Maybe just keep active one here.
            currentVideoDuration: null, // From video element
            currentVideoTime: null,     // From video element
            videoReadyState: null     // From video element
        };

        this.aggregatedStats = {
            timeToFirstFrame: null,
            startupTime: null,
            totalRebufferingEvents: 0,
            totalRebufferingDuration: 0,
            totalQualitySwitches: 0,
            minBitrate: null,
            maxBitrate: null,
            avgBitrate: null, // Will need calculation later
            avgSegmentDownloadTimeMs: null, // Will need calculation
            avgPlaylistLatencyMs: null,     // Will need calculation
            avgFragmentLatencyMs: null,     // Will need calculation (TTFB)
            totalSegmentsRequested: 0,
            totalSegmentsLoaded: 0,
            totalSegmentsFailed: 0,
            sessionDurationMs: 0, // Calculated periodically or at end
            errorCount: 0,
            // Add cache stats placeholders if managed here
            cacheHits: 0,
            cacheMisses: 0,
        };

        // --- Time-Series Buffers (Capped) ---
        this.metricHistory = {
            bitrate: [],
            bufferLevel: [],
            fragmentLatency: [], // TTFB
            playlistLatency: [], // TTFB
            segmentDownloadTime: [],
            throughput: [], // Optional: if needed beyond bitrate
            downloadSpeed: [], // Optional: if needed beyond bitrate
            // Add more as needed
        };

        // --- Event Log (Capped) ---
        this.eventLog = []; // Stores { timestamp: Date, type: string, message: string, data?: any }

        // --- Running Totals for Averages ---
        // Used internally to calculate averages without iterating full history
        this._internals = {
            bitrateSum: 0,
            bitrateCount: 0,
            segmentDownloadTimeSum: 0,
            segmentDownloadTimeCount: 0,
            playlistLatencySum: 0,
            playlistLatencyCount: 0,
            fragmentLatencySum: 0,
            fragmentLatencyCount: 0,
        };

        console.log('[DataManager] Instance created');
    }

    // --- Methods to ADD/UPDATE Data ---

    setSessionInfo(key, value) {
        if (Object.hasOwnProperty.call(this.sessionInfo, key)) {
            this.sessionInfo[key] = value;
            this.addEvent(`Session Info Updated: ${key} = ${JSON.stringify(value)}`, 'system'); // Optional logging
        } else {
            console.warn(`[DataManager] Attempted to set unknown session info key: ${key}`);
        }
    }

    updateCurrentState(key, value) {
        if (Object.hasOwnProperty.call(this.currentState, key)) {
            // Only update if value actually changed? Optional optimization.
            // if (this.currentState[key] !== value) {
            this.currentState[key] = value;
            // Maybe dispatch a custom event for specific state changes if needed by UI?
            // document.dispatchEvent(new CustomEvent('dataManagerUpdate', { detail: { key, value } }));
            // }
        } else {
            console.warn(`[DataManager] Attempted to update unknown current state key: ${key}`);
        }
    }

    incrementAggregate(key, amount = 1) {
        if (Object.hasOwnProperty.call(this.aggregatedStats, key)) {
            if (typeof this.aggregatedStats[key] === 'number') {
                this.aggregatedStats[key] += amount;
            } else {
                console.warn(`[DataManager] Aggregate key ${key} is not a number.`);
            }
        } else {
            console.warn(`[DataManager] Attempted to increment unknown aggregate key: ${key}`);
        }
    }

    accumulateAggregate(key, value) {
        if (Object.hasOwnProperty.call(this.aggregatedStats, key)) {
            if (typeof this.aggregatedStats[key] === 'number' && typeof value === 'number' && isFinite(value)) {
                this.aggregatedStats[key] += value;
            } else {
                console.warn(`[DataManager] Aggregate key ${key} or value ${value} is not a number.`);
            }
        } else {
            console.warn(`[DataManager] Attempted to accumulate unknown aggregate key: ${key}`);
        }
    }

    // Update min/max/avg for bitrate specifically
    _updateBitrateStats(bitrate) {
        if (typeof bitrate !== 'number' || !isFinite(bitrate)) return;

        this.aggregatedStats.minBitrate = this.aggregatedStats.minBitrate === null
            ? bitrate
            : Math.min(this.aggregatedStats.minBitrate, bitrate);

        this.aggregatedStats.maxBitrate = this.aggregatedStats.maxBitrate === null
            ? bitrate
            : Math.max(this.aggregatedStats.maxBitrate, bitrate);

        // Update running average totals
        this._internals.bitrateSum += bitrate;
        this._internals.bitrateCount++;
        this.aggregatedStats.avgBitrate = this._internals.bitrateSum / this._internals.bitrateCount;
    }

    // Helper to add to capped arrays (like metric history)
    _addToCappedArray(array, item, maxSize) {
        if (array.length >= maxSize) {
            array.shift(); // Remove the oldest item
        }
        array.push(item);
    }

    addTimeSeriesMetric(metricName, value, timestamp = Date.now()) {
        if (Object.hasOwnProperty.call(this.metricHistory, metricName)) {
            const entry = { timestamp, value };
            this._addToCappedArray(this.metricHistory[metricName], entry, this.config.maxMetricHistorySize);

            // Update specific running averages if needed
            if (metricName === 'segmentDownloadTime' && typeof value === 'number') {
                this._internals.segmentDownloadTimeSum += value;
                this._internals.segmentDownloadTimeCount++;
                this.aggregatedStats.avgSegmentDownloadTimeMs = this._internals.segmentDownloadTimeSum / this._internals.segmentDownloadTimeCount;
            } else if (metricName === 'playlistLatency' && typeof value === 'number') {
                this._internals.playlistLatencySum += value;
                this._internals.playlistLatencyCount++;
                this.aggregatedStats.avgPlaylistLatencyMs = this._internals.playlistLatencySum / this._internals.playlistLatencyCount;
            } else if (metricName === 'fragmentLatency' && typeof value === 'number') {
                this._internals.fragmentLatencySum += value;
                this._internals.fragmentLatencyCount++;
                this.aggregatedStats.avgFragmentLatencyMs = this._internals.fragmentLatencySum / this._internals.fragmentLatencyCount;
                this.updateCurrentState('currentLatency', this.aggregatedStats.avgFragmentLatencyMs); // Update current state too
            }
            // Add more specific average calculations here if needed (throughput, etc.)

        } else {
            console.warn(`[DataManager] Attempted to add to unknown metric history: ${metricName}`);
        }
    }

    addEvent(message, type = 'info', data = null, timestamp = new Date()) {
        const eventEntry = {
            timestamp: timestamp, // Use Date object or ISO string TBD
            date: timestamp.toISOString(), // Add ISO string date for reporting
            type: type,
            message: message,
            // Sample data structure similar fields - using 'text' for message
            text: message,
            isError: type === 'error',
            isHighlighted: ['error', 'rebuffer', 'quality-change', 'cdn'].includes(type), // Example highlighting logic
            // Add optional data payload
            ...(data && { data: data })
        };
        this._addToCappedArray(this.eventLog, eventEntry, this.config.maxEventLogSize);
    }

    // --- Specific Record Methods (called by event handlers) ---

    recordManifestParsed(data) {
        console.log('[DataManager] Recording Manifest Parsed');
        if (data.audioTracks) {
            const mappedTracks = data.audioTracks.map(t => ({ id: t.id, name: t.name || `Track ${t.id}`, language: t.lang || 'und', default: !!t.default, codec: t.audioCodec || '?' }));
            this.setSessionInfo('availableAudioTracks', mappedTracks);
            // Determine initial active track/codec here or let LEVEL_SWITCHED/AUDIO_TRACK_SWITCHED handle it
        } else {
            this.setSessionInfo('availableAudioTracks', []);
        }
        if (data.subtitles) {
            const mappedSubs = data.subtitles.map(t => ({ id: t.id, name: t.name || `Subtitle ${t.id}`, language: t.lang || 'und', default: !!t.default }));
            this.setSessionInfo('availableSubtitleTracks', mappedSubs);
        } else {
            this.setSessionInfo('availableSubtitleTracks', []);
        }
        if (data.levels) {
            const mappedLevels = data.levels.map(l => ({ resolution: `${l.width}x${l.height}`, bandwidth: l.bitrate, codecAudio: l.audioCodec, codecVideo: l.videoCodec, text: `${l.width}x${l.height} @ ${(l.bitrate / 1000).toFixed(0)} kbps` })); // Example mapping
            this.setSessionInfo('availableResolutions', mappedLevels);
        }

        if (data.stats) this.recordPlaylistLoad(data.stats, 'Manifest');
        this.addEvent('Manifest parsed', 'system', data);
    }

    recordAudioTracksUpdated(data, hlsInstance) {
        console.log('[DataManager] Recording Audio Tracks Updated');
        if (data.audioTracks && data.audioTracks.length > 0) {
            const mappedTracks = data.audioTracks.map(t => ({ id: t.id, name: t.name || `Track ${t.id}`, language: t.lang || 'und', default: !!t.default, codec: t.audioCodec || '?' }));
            this.setSessionInfo('availableAudioTracks', mappedTracks); // Update the list

            const currentTrackIndex = hlsInstance.audioTrack;
            const activeTrack = mappedTracks[currentTrackIndex];
            if (activeTrack) {
                this.updateCurrentState('currentAudioTrackId', activeTrack.id);
                this.updateCurrentState('currentAudioCodec', activeTrack.codec || '?');
                this.addEvent(`Audio track list updated, active: ${activeTrack.name} (ID: ${activeTrack.id})`, 'audio');
            } else {
                this.updateCurrentState('currentAudioTrackId', null);
                this.updateCurrentState('currentAudioCodec', '?');
                this.addEvent('Audio track list updated, but no active track identified', 'warning');
            }
        } else {
            // Don't clear if we only had an inferred track before? Or clear always? Decide policy.
            // Current policy: Clear if no tracks arrive and we didn't have only inferred
            const wasInferred = this.sessionInfo.availableAudioTracks.length === 1 && this.sessionInfo.availableAudioTracks[0].id === 0;
            if (!wasInferred) {
                this.setSessionInfo('availableAudioTracks', []);
                this.updateCurrentState('currentAudioTrackId', null);
                this.updateCurrentState('currentAudioCodec', '?');
                this.addEvent('Audio track list cleared by update', 'audio');
            }
        }
    }

    recordAudioTrackSwitched(data) {
        console.log('[DataManager] Recording Audio Track Switched');
        const switchedTrackId = data.id;
        const switchedTrack = this.sessionInfo.availableAudioTracks.find(track => track.id === switchedTrackId);
        this.updateCurrentState('currentAudioTrackId', switchedTrackId);
        if (switchedTrack) {
            this.updateCurrentState('currentAudioCodec', switchedTrack.codec || '?');
            this.addEvent(`Audio switched to: ${switchedTrack.name} (ID: ${switchedTrackId})`, 'audio-switch');
        } else {
            this.updateCurrentState('currentAudioCodec', '?'); // Codec unknown if track not in list
            this.addEvent(`Audio switched to unknown track ID: ${switchedTrackId}`, 'audio-switch');
        }
    }

    recordLevelSwitch(data, hlsInstance) {
        console.log('[DataManager] Recording Level Switch');
        this.incrementAggregate('totalQualitySwitches');
        const levelIndex = data.level;
        const levelInfo = hlsInstance.levels[levelIndex];
        if (levelInfo) {
            const newBitrate = levelInfo.bitrate;
            const newResolution = `${levelInfo.width}x${levelInfo.height}`;
            const newAudioCodec = levelInfo.audioCodec || '?';

            this.updateCurrentState('currentBitrate', newBitrate);
            this.updateCurrentState('currentResolution', newResolution);
            this.addTimeSeriesMetric('bitrate', newBitrate);
            this._updateBitrateStats(newBitrate);

            // Update audio codec state based on level switch
            this.updateCurrentState('currentAudioCodec', newAudioCodec);
            // If it's an inferred track, update its codec in sessionInfo too
            const currentTrack = this.sessionInfo.availableAudioTracks.find(t => t.id === this.currentState.currentAudioTrackId);
            if (currentTrack && currentTrack.id === 0) {
                currentTrack.codec = newAudioCodec; // Update the inferred track's codec
            }

            this.addEvent(`Quality switched to ${newResolution} @ ${(newBitrate / 1e6).toFixed(2)} Mbps (Audio: ${newAudioCodec})`, 'quality-change', levelInfo);
        } else {
            this.addEvent(`Quality switched to unknown level index: ${levelIndex}`, 'warning');
        }
    }

    recordFragLoading(data) {
        // console.log('[DataManager] Recording Frag Loading'); // Can be noisy
        this.incrementAggregate('totalSegmentsRequested');
    }

    recordFragLoaded(data, fragLoadStats) {
        // console.log('[DataManager] Recording Frag Loaded'); // Can be noisy
        this.incrementAggregate('totalSegmentsLoaded');

        const { durationMs, sizeBytes, latencyMs, url, sn } = fragLoadStats;

        this.addTimeSeriesMetric('segmentDownloadTime', durationMs); // Add to history and update avg
        this.addTimeSeriesMetric('fragmentLatency', latencyMs); // Add to history and update avg

        if (durationMs > 0) {
            const throughputBps = (sizeBytes * 8) / (durationMs / 1000);
            const downloadSpeedBps = sizeBytes / (durationMs / 1000);
            this.addTimeSeriesMetric('throughput', throughputBps);
            this.addTimeSeriesMetric('downloadSpeed', downloadSpeedBps);
            // Maybe update current bitrate/resolution here too as a fallback?
            // const levelInfo = hlsInstance?.levels?.[data.frag.level]; etc...
        }

        // Store detailed segment info? Optional - could make history large
        // this.addTimeSeriesMetric('segmentDetails', fragLoadStats);
    }

    recordPlaylistLoad(stats, type = 'Level') {
        console.log(`[DataManager] Recording Playlist Load (${type})`);
        if (stats && stats.tfirst > 0 && stats.trequest > 0 && stats.tfirst >= stats.trequest) {
            const latencyMs = stats.tfirst - stats.trequest;
            this.addTimeSeriesMetric('playlistLatency', latencyMs); // Adds to history & updates avg
            this.addEvent(`Playlist loaded (${type}), Latency: ${latencyMs.toFixed(0)} ms`, 'network');
        }
    }

    recordError(data) {
        console.log('[DataManager] Recording Error');
        this.incrementAggregate('errorCount');
        let isSegmentFailure = false;

        // Check if it's a segment loading/parsing error
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.context && typeof data.context.type === 'string' && data.context.type.toLowerCase() === 'fragment' &&
            (data.details === Hls.ErrorDetails.FRAG_LOAD_ERROR || data.details === Hls.ErrorDetails.FRAG_LOAD_TIMEOUT)) {
            isSegmentFailure = true;
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && data.context && typeof data.context.type === 'string' && data.context.type.toLowerCase() === 'fragment' &&
            data.details === Hls.ErrorDetails.FRAG_PARSING_ERROR) {
            isSegmentFailure = true;
        }

        if (isSegmentFailure) {
            this.incrementAggregate('totalSegmentsFailed');
        }

        // Construct detailed error message for the log
        let errorMessage = `HLS Error: ${data.type || 'Unknown Type'} - ${data.details || 'No Details'}`;
        if (data.fatal) errorMessage += " (Fatal)";
        if (data.reason) errorMessage += ` Reason: ${data.reason}`;
        if (data.context) {
            if (data.context.url) errorMessage += ` URL: ${data.context.url}`;
            if (typeof data.context.level === 'number') errorMessage += ` Level: ${data.context.level}`;
            if (data.context.type) errorMessage += ` Context: ${data.context.type}`;
        }
        this.addEvent(errorMessage, 'error', data); // Log the full HLS data object as payload
    }

    recordVideoState(videoElement) {
        if (!videoElement) return;
        this.updateCurrentState('currentVideoTime', videoElement.currentTime);
        this.updateCurrentState('currentVideoDuration', videoElement.duration);
        this.updateCurrentState('videoReadyState', videoElement.readyState);
        this.updateCurrentState('isBuffering', videoElement.readyState < videoElement.HAVE_FUTURE_DATA); // Example buffering detection
        this.updateCurrentState('playbackRate', videoElement.playbackRate);

        // Maybe poll buffer level here too
        // const bufferEnd = videoElement.buffered.length > 0 ? videoElement.buffered.end(videoElement.buffered.length - 1) : 0;
        // const bufferLevel = bufferEnd - videoElement.currentTime;
        // this.updateCurrentState('currentBufferLevel', bufferLevel);
        // this.addTimeSeriesMetric('bufferLevel', bufferLevel);
    }

    recordRebufferStart() {
        this.updateCurrentState('isBuffering', true);
        this.addEvent('Buffering start', 'rebuffer');
    }

    recordRebufferEnd(durationSeconds) {
        this.updateCurrentState('isBuffering', false);
        this.incrementAggregate('totalRebufferingEvents');
        this.accumulateAggregate('totalRebufferingDuration', durationSeconds);
        this.addEvent(`Buffering end after ${durationSeconds.toFixed(2)}s`, 'rebuffer');
    }

    // --- Methods to GET Data ---

    getSessionInfo() {
        return { ...this.sessionInfo }; // Return a copy
    }

    getCurrentState() {
        return { ...this.currentState }; // Return a copy
    }

    getAggregatedStats() {
        // Calculate success rate on the fly
        const stats = { ...this.aggregatedStats }; // Copy
        if (stats.totalSegmentsRequested > 0) {
            const loaded = Math.min(stats.totalSegmentsLoaded, stats.totalSegmentsRequested);
            stats.segmentSuccessRate = (loaded / stats.totalSegmentsRequested) * 100;
            stats.segmentSuccessText = `${stats.segmentSuccessRate.toFixed(1)}% (${loaded}/${stats.totalSegmentsRequested})`;
        } else {
            stats.segmentSuccessRate = 100; // Or null/NaN?
            stats.segmentSuccessText = (stats.totalSegmentsFailed === 0) ? '100% (0/0)' : 'N/A';
        }
        // Calculate session duration
        stats.sessionDurationMs = Date.now() - this.sessionInfo.startTime;
        return stats;
    }

    getEventLog(options = {}) {
        // Options: startTime, endTime, filterType
        // For now, just return full log (copy)
        return [...this.eventLog]; // Return a copy
    }

    getMetricHistory(metricName, options = {}) {
        // Options: startTime, endTime
        if (Object.hasOwnProperty.call(this.metricHistory, metricName)) {
            // Add filtering by time later if needed
            return [...this.metricHistory[metricName]]; // Return a copy
        }
        return [];
    }

    // Example: Get a combined report object
    getReportData(format = 'json') {
        const report = {
            sessionInfo: this.getSessionInfo(),
            aggregatedStats: this.getAggregatedStats(),
            currentState: this.getCurrentState(), // Include latest state? Optional
            eventLog: this.getEventLog(), // Include recent events?
            // Potentially include recent metric history samples
            // recentBitrate: this.getMetricHistory('bitrate').slice(-10), // Last 10 bitrate values
        };

        if (format === 'json') {
            try {
                // Use replacer to handle potential circular references if data objects get complex
                const cache = new Set();
                const replacer = (key, value) => {
                    if (typeof value === 'object' && value !== null) {
                        if (cache.has(value)) {
                            // Circular reference found, discard key
                            return '[Circular]';
                        }
                        // Store value in our collection
                        cache.add(value);
                    }
                    return value;
                };
                return JSON.stringify(report, replacer, 2); // Pretty print
            } catch (error) {
                console.error("[DataManager] Error stringifying report data:", error);
                return JSON.stringify({ error: "Failed to generate report", details: error.message });
            }
        }
        return report; // Return object if format isn't json
    }
}

// --- Make DataManager accessible globally (for Cypress, debugging, other modules) ---
// Choose ONE way:
// 1. Simple global variable (easiest for now)
// window.dataManager = new DataManager();

// 2. Attach to a namespace
// window.vidinfra = window.vidinfra || {};
// window.vidinfra.dataManager = new DataManager();

// 3. Use a Singleton pattern if preferred (more complex)
let instance = null;
function getDataManagerInstance() {
    if (!instance) {
        instance = new DataManager();
        // Make it globally accessible AFTER creation
        window.dataManager = instance;
        console.log('[DataManager] Singleton instance created and assigned to window.dataManager');
    }
    return instance;
}

// Initialize the singleton instance immediately so it's ready
getDataManagerInstance();

console.log('[DataManager] Module finished.');

// Export the instance getter if using modules (though global access might be easier for Cypress)
// export { getDataManagerInstance };