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
        audioTracks: [], // Will hold explicit or inferred tracks
        currentAudioTrack: null, // <<< ADDED: Store ID of active track (or 0 for inferred)
        currentAudioCodec: '?', // <<< ADDED: Store codec of active track/level
        subtitleTracks: [],
        downloadSpeed: [],
        throughput: [],
        latency: [],
        cdnProvider: 'Unknown',
        playbackRate: 1,
        eventHistory: []
    };

    // ... (rest of your code before hookVideoAndHls)

    let fragmentLoadingData = {};

    document.addEventListener('DOMContentLoaded', () => {
        setupDetailTabs();
        updateQoEDisplay();
    });

    // player_loader has initialized the Hls instance
    document.addEventListener('hlsLoaded', e => {
        const hls = e.detail.hls;
        if (!hls) {
            console.warn('[qoe_ui] hlsLoaded fired but no Hls instance found');
            return;
        }
        hookVideoAndHls(hls);
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
    function hookVideoAndHls() { // Removed hls parameter, using window.hlsPlayerInstance as original

        document.addEventListener('cdnInfoDetected', e => {
            detectCDN(e.detail.url, e.detail.headers);
            updateQoEDisplay();
        });

        const video = document.getElementById('hlsVideoPlayer');
        const hls = window.hlsPlayerInstance; // Using global instance as per original code

        if (video) {
            qoeData.startTime = performance.now();
            video.addEventListener('loadstart', () => {
                qoeData.loadStart = performance.now();
                // Tag as 'startup' so it picks up our green .event-startup style
                addEvent('Video loadstart', 'startup');
                updateQoEDisplay();
            });
            video.addEventListener('loadeddata', () => {
                if (!qoeData.firstFrame) {
                    qoeData.firstFrame = performance.now();
                    addEvent(`First frame after ${((qoeData.firstFrame - qoeData.startTime) / 1000).toFixed(2)}s`, 'info');
                    updateQoEDisplay(); // Update display after first frame
                }
                // <<< MUXED AUDIO: Secondary Check - Native Video Tracks >>>
                // Check if the browser detected audio tracks natively, even if HLS events didn't fire.
                if (video.audioTracks && video.audioTracks.length > 0 && qoeData.audioTracks.length === 0) {
                    console.log('[qoe_ui] Native video element reports audio tracks:', video.audioTracks.length);
                    // This confirms audio presence. We *could* try to infer a track here,
                    // but let's rely on the HLS level info first for codec details.
                    addEvent(`Detected ${video.audioTracks.length} native audio track(s) (might be muxed)`);
                    // Optionally: If still no track after MANIFEST_PARSED checks codec, infer here.
                    // if (qoeData.audioTracks.length === 0 && qoeData.currentAudioCodec === '?') {
                    //     qoeData.audioTracks.push({ id: 0, name: 'Inferred Muxed Audio (Native)', language: video.audioTracks[0]?.language || 'und', default: true, codec: '?' });
                    //     qoeData.currentAudioTrack = 0;
                    //     addEvent('Inferred muxed audio presence via native track');
                    //     updateQoEDisplay(); // Update display if track inferred here
                    // }
                } else if (video.audioTracks && video.audioTracks.length === 0 && qoeData.audioTracks.length > 0 && qoeData.audioTracks[0]?.name?.includes('Inferred')) {
                    // If native tracks disappear BUT we had an inferred track, maybe remove the inferred one? Or keep? Let's keep for now.
                    console.log('[qoe_ui] Native video element reports NO audio tracks, but inferred track exists.');
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
            // When the playback quality switches, bump the counter and record the new bitrate & resolution
            hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
                qoeData.qualitySwitches++;
                const lvl = hls.levels[data.level];
                if (!lvl) return; // Guard against missing level

                qoeData.currentBitrate = lvl.bitrate;
                qoeData.currentResolution = `${lvl.width}x${lvl.height}`;

                // <<< MUXED AUDIO: Check for audio codec on level switch >>>
                let eventMsg = `Quality → ${qoeData.currentResolution}`;
                const previousCodec = qoeData.currentAudioCodec;
                if (lvl.audioCodec) {
                    qoeData.currentAudioCodec = lvl.audioCodec;
                    eventMsg += ` (Audio: ${lvl.audioCodec})`;
                    // If no audio tracks were ever detected (not explicit, not inferred yet), infer one now.
                    if (qoeData.audioTracks.length === 0) {
                        qoeData.audioTracks.push({
                            id: 0, // Use 0 as the ID for the single inferred track
                            name: 'Inferred Muxed Audio',
                            language: 'und',
                            default: true,
                            codec: lvl.audioCodec
                        });
                        qoeData.currentAudioTrack = 0; // Set the inferred track as active
                        addEvent(`Muxed audio (Codec: ${lvl.audioCodec})`, 'audio');
                    }
                    // If we have an inferred track already, update its codec if it changed
                    else if (qoeData.audioTracks.length === 1 && qoeData.audioTracks[0].id === 0 && qoeData.audioTracks[0].codec !== lvl.audioCodec) {
                        qoeData.audioTracks[0].codec = lvl.audioCodec;
                        addEvent(`Audio codec updated to ${lvl.audioCodec}`, 'audio');
                    }
                } else if (qoeData.audioTracks.length === 0 || (qoeData.audioTracks.length === 1 && qoeData.audioTracks[0].id === 0)) {
                    // If the new level has NO codec info AND we have no explicit tracks (only inferred or none)
                    // Update the codec to '?'
                    qoeData.currentAudioCodec = '?';
                    if (qoeData.audioTracks.length === 1 && qoeData.audioTracks[0].id === 0) {
                        qoeData.audioTracks[0].codec = '?'; // Update inferred track codec too
                    }
                    eventMsg += ` (No audio codec info)`;
                }
                // <<< END MUXED AUDIO Check >>>

                addEvent(eventMsg, 'quality-change');
                updateQoEDisplay();
            });

            // Before each fragment load, note the start time & URL for later timing calculations
            hls.on(Hls.Events.FRAG_LOADING, (_, data) => {
                fragmentLoadingData[data.frag.sn] = {
                    start: performance.now(),
                    url: data.frag.url
                };
            });

            // After a fragment finishes loading, compute throughput, download speed, latency,
            // capture the current ABR bitrate/resolution, detect the CDN, then update the UI
            hls.on(Hls.Events.FRAG_LOADED, (_, data) => {
                // console.log('[qoe_ui] FRAG_LOADED', data.frag.level); // Keep for debugging if needed
                const info = fragmentLoadingData[data.frag.sn];
                if (!info) return;

                // 1) throughput / download speed
                const loadMs = performance.now() - info.start;
                const bytes = data.stats.total;
                if (loadMs > 0) { // Avoid division by zero
                    qoeData.throughput.push((bytes * 8) / (loadMs / 1000));
                    qoeData.downloadSpeed.push(bytes / (loadMs / 1000));
                }

                // 2) latency via ResourceTiming (first-byte time)
                const entries = performance.getEntriesByName(info.url);
                if (entries.length) {
                    const e = entries[entries.length - 1];
                    // Ensure timing values are valid before calculating latency
                    if (e.responseStart > 0 && e.requestStart > 0 && e.responseStart >= e.requestStart) {
                        qoeData.latency.push(e.responseStart - e.requestStart);
                    }
                }

                // 3) capture current ABR level's bitrate & resolution (redundant w/ LEVEL_SWITCHED but good fallback)
                const lvlInfo = hls.levels[data.frag.level];
                if (lvlInfo) {
                    qoeData.currentBitrate = lvlInfo.bitrate;
                    qoeData.currentResolution = `${lvlInfo.width}x${lvlInfo.height}`;
                    // <<< MUXED AUDIO: Fallback check for audio codec on fragment load >>>
                    // Update codec only if it wasn't set or seems inconsistent. Primary source is LEVEL_SWITCHED/MANIFEST_PARSED.
                    if (lvlInfo.audioCodec && qoeData.currentAudioCodec !== lvlInfo.audioCodec) {
                        // Only update if we think we don't have explicit tracks or the inferred codec is wrong
                        if (qoeData.audioTracks.length === 0 || (qoeData.audioTracks.length === 1 && qoeData.audioTracks[0].id === 0)) {
                            qoeData.currentAudioCodec = lvlInfo.audioCodec;
                            // Infer track if absolutely needed (should have been caught earlier)
                            if (qoeData.audioTracks.length === 0) {
                                qoeData.audioTracks.push({ id: 0, name: 'Inferred Muxed Audio', language: 'und', default: true, codec: lvlInfo.audioCodec });
                                qoeData.currentAudioTrack = 0;
                                addEvent(`Muxed audio fragment (Codec: ${lvlInfo.audioCodec})`, 'audio');
                            } else {
                                // Update existing inferred track's codec
                                qoeData.audioTracks[0].codec = lvlInfo.audioCodec;
                                addEvent(`Updated audio codec fragment: ${lvlInfo.audioCodec}`, 'audio');
                            }
                        }
                    } else if (!lvlInfo.audioCodec && qoeData.currentAudioCodec !== '?' && (qoeData.audioTracks.length === 0 || (qoeData.audioTracks.length === 1 && qoeData.audioTracks[0].id === 0))) {
                        // If fragment level lacks codec info, but we thought we had one (and it's inferred/none)
                        qoeData.currentAudioCodec = '?';
                        if (qoeData.audioTracks.length === 1 && qoeData.audioTracks[0].id === 0) {
                            qoeData.audioTracks[0].codec = '?';
                        }
                    }
                    // <<< END MUXED AUDIO Fallback >>>
                }

                // 4) existing CDN detection / cleanup / UI update
                detectCDN(info.url, data.stats.headers); // Assuming data.stats.headers exists, otherwise might need adjustment
                delete fragmentLoadingData[data.frag.sn];
                updateQoEDisplay();
            });

            // Once the manifest is parsed, pick up any audio/subtitle tracks and
            // set the _initial_ bitrate/resolution
            hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
                console.log('[qoe_ui] MANIFEST_PARSED'); // Log when parsed
                let explicitAudioTracksFound = false; // Flag

                // --- Handle Explicit Audio Tracks ---
                if (data.audioTracks && data.audioTracks.length > 0) {
                    explicitAudioTracksFound = true;
                    qoeData.audioTracks = data.audioTracks.map(t => ({
                        id: t.id, // Use ID provided by hls.js
                        name: t.name || `Track ${t.id}`,
                        language: t.lang || 'und', // Use 'und' for undetermined
                        default: !!t.default,
                        codec: t.audioCodec || '?' // Capture codec if provided
                    }));
                    addEvent(`Detected ${qoeData.audioTracks.length} explicit audio track(s)`, 'audio');

                    // Find the default or first track to set as current initially
                    let initialTrack = qoeData.audioTracks.find(t => t.default);
                    if (!initialTrack && qoeData.audioTracks.length > 0) {
                        initialTrack = qoeData.audioTracks[0]; // Fallback to the first track
                    }
                    if (initialTrack) {
                        qoeData.currentAudioTrack = initialTrack.id; // Store the ID
                        qoeData.currentAudioCodec = initialTrack.codec || '?'; // Store its codec
                        addEvent(`Initial audio track set to: ${initialTrack.name} (ID: ${initialTrack.id}, Codec: ${qoeData.currentAudioCodec})`, 'audio-switch');
                    } else {
                        qoeData.currentAudioTrack = null;
                        qoeData.currentAudioCodec = '?';
                    }
                } else {
                    // No explicit tracks found in manifest data
                    qoeData.audioTracks = [];
                    qoeData.currentAudioTrack = null;
                    qoeData.currentAudioCodec = '?'; // Reset codec for now
                    addEvent(`No explicit audio tracks found in manifest`, 'audio');
                }

                // --- Handle Subtitles (Existing logic) ---
                if (data.subtitles && data.subtitles.length > 0) {
                    qoeData.subtitleTracks = data.subtitles.map(t => ({
                        id: t.id, // Good to have subtitle ID too if available
                        name: t.name || `Subtitle ${t.id}`,
                        language: t.lang || 'und',
                        default: !!t.default
                    }));
                    addEvent(`Detected ${qoeData.subtitleTracks.length} subtitle track(s)`);
                } else {
                    qoeData.subtitleTracks = [];
                }

                // --- Set Initial Bitrate/Resolution & Check for Muxed Audio ---
                if (hls.levels.length > 0) {
                    // Determine initial level index (use startLevel if set, otherwise currentLevel, fallback to 0)
                    let initialLevelIndex = hls.startLevel;
                    if (initialLevelIndex === -1 || initialLevelIndex >= hls.levels.length) {
                        initialLevelIndex = hls.currentLevel; // currentLevel might be -1 initially too
                    }
                    if (initialLevelIndex === -1 || initialLevelIndex >= hls.levels.length) {
                        initialLevelIndex = 0; // Safe fallback
                    }

                    const lvl = hls.levels[initialLevelIndex];
                    if (lvl) { // Ensure level exists
                        qoeData.currentBitrate = lvl.bitrate;
                        qoeData.currentResolution = `${lvl.width}x${lvl.height}`;
                        let qualityEventMsg = `Initial Quality → ${qoeData.currentResolution}`;

                        // <<< MUXED AUDIO: Check initial level for audio codec >>>
                        if (lvl.audioCodec) {
                            qualityEventMsg += ` (Audio: ${lvl.audioCodec})`;
                            // If NO explicit tracks were found earlier, infer a default muxed track now.
                            if (!explicitAudioTracksFound) {
                                qoeData.currentAudioCodec = lvl.audioCodec; // Set the codec
                                qoeData.audioTracks = [{
                                    id: 0, // Assign ID 0 for the single inferred track
                                    name: 'Inferred Muxed Audio',
                                    language: 'und',
                                    default: true,
                                    codec: lvl.audioCodec
                                }];
                                qoeData.currentAudioTrack = 0; // Set the inferred track (ID 0) as active
                                addEvent(`Identified muxed audio (Codec: ${lvl.audioCodec})`, 'audio');
                            } else if (qoeData.currentAudioCodec === '?') {
                                // We have explicit tracks, but didn't get a codec initially, update the current one
                                qoeData.currentAudioCodec = lvl.audioCodec;
                                const currentTrackObj = qoeData.audioTracks.find(t => t.id === qoeData.currentAudioTrack);
                                if (currentTrackObj) currentTrackObj.codec = lvl.audioCodec; // Update codec in track object
                                addEvent(`Updated initial audio track codec to ${lvl.audioCodec}`, 'audio');
                            }
                        } else {
                            qualityEventMsg += ` (No audio codec info)`;
                            // If no explicit tracks AND no codec info on level, ensure codec is '?'
                            if (!explicitAudioTracksFound) {
                                qoeData.currentAudioCodec = '?';
                            }
                        }
                        // <<< END MUXED AUDIO Check >>>
                        addEvent(qualityEventMsg, 'quality-change');

                    } else {
                        addEvent(`Initial quality level not found (Index: ${initialLevelIndex})`, 'error');
                    }
                } else {
                    addEvent(`No quality levels found in manifest`, 'error');
                }

                updateQoEDisplay(); // Update UI after parsing manifest
            });

            // AUDIO TRACKS UPDATED (Handles cases where audio tracks load separately or change later)
            hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
                console.log('[qoe_ui] AUDIO_TRACKS_UPDATED fired');
                const previouslyInferred = qoeData.audioTracks.length === 1 && qoeData.audioTracks[0].id === 0;

                if (data.audioTracks && data.audioTracks.length > 0) {
                    // Replace current tracks (whether inferred or previous explicit) with the new list
                    qoeData.audioTracks = data.audioTracks.map(t => ({
                        id: t.id,
                        name: t.name || `Track ${t.id}`,
                        language: t.lang || 'und',
                        default: !!t.default,
                        codec: t.audioCodec || '?' // Capture codec
                    }));

                    // Determine which track is now active (hls.audioTrack is the index in the *new* list)
                    const currentTrackIndex = hls.audioTrack; // Index in data.audioTracks
                    const activeTrack = data.audioTracks[currentTrackIndex];

                    if (activeTrack) {
                        qoeData.currentAudioTrack = activeTrack.id; // Store the ID
                        qoeData.currentAudioCodec = activeTrack.audioCodec || '?'; // Update codec
                        if (previouslyInferred) {
                            addEvent(`Replaced audio with ${qoeData.audioTracks.length} explicit track(s)`, 'audio');
                        } else {
                            addEvent(`Updated audio tracks list (${qoeData.audioTracks.length} found)`, 'audio');
                        }
                        addEvent(`Audio → ${activeTrack.name || activeTrack.id} (ID: ${activeTrack.id}, Codec: ${qoeData.currentAudioCodec})`, 'audio-switch');
                    } else {
                        // Should not happen if list is not empty, but handle defensively
                        qoeData.currentAudioTrack = null;
                        qoeData.currentAudioCodec = '?';
                        addEvent(`Audio tracks updated, but couldn't identify active track (Index: ${currentTrackIndex})`, 'error');
                    }

                } else {
                    // Event fired with an empty list. Clear only if we didn't have an inferred track.
                    if (!previouslyInferred) {
                        qoeData.audioTracks = [];
                        qoeData.currentAudioTrack = null;
                        qoeData.currentAudioCodec = '?';
                        addEvent(`Explicit audio tracks list cleared`, 'audio');
                    } else {
                        addEvent(`AUDIO_TRACKS_UPDATED: Fired with empty list, keeping inferred track`, 'audio');
                    }
                }
                updateQoEDisplay();
            });

            // AUDIO TRACK SWITCHED (User or ABR initiated switch between explicit tracks)
            hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, data) => {
                // data.id is the *ID* of the now‐active audio track
                const switchedTrackId = data.id;
                const switchedTrack = qoeData.audioTracks.find(track => track.id === switchedTrackId);

                if (switchedTrack) {
                    qoeData.currentAudioTrack = switchedTrackId; // Update active track ID
                    qoeData.currentAudioCodec = switchedTrack.codec || '?'; // Update codec
                    addEvent(`Audio → ${switchedTrack.name || switchedTrackId} (ID: ${switchedTrackId}, Codec: ${qoeData.currentAudioCodec})`, 'audio-switch');
                } else {
                    // If the switched track ID isn't in our list (shouldn't happen often)
                    qoeData.currentAudioTrack = switchedTrackId; // Still store the ID HLS reports
                    qoeData.currentAudioCodec = '?'; // Codec unknown
                    addEvent(`Audio → Switched to unknown track ID: ${switchedTrackId}`, 'audio-switch');
                }
                updateQoEDisplay();
            });

            // --- Consolidated Error Handling ---
            // Remove the separate audio error handler block if it exists.
            hls.off(Hls.Events.ERROR, audioErrorHandler); // Assuming you might have named the specific audio error handler if separated

            // Single comprehensive error handler
            const genericErrorHandler = (_, data) => {
                let errorMessage = `HLS Error: ${data.type} - ${data.details}`;
                if (data.fatal) {
                    errorMessage += " (Fatal)";
                }
                if (data.reason) {
                    errorMessage += ` Reason: ${data.reason}`;
                }
                // Add context if available (e.g., URL, fragment info)
                if (data.context) {
                    if (data.context.url) errorMessage += ` URL: ${data.context.url}`;
                    if (typeof data.context.level === 'number') errorMessage += ` Level: ${data.context.level}`;
                }

                console.error('HLS Error:', data); // Log the full error object for debugging
                addEvent(errorMessage, 'error');

                // Specific handling/logging for audio-related errors
                if (data.details && data.details.toLowerCase().includes('audio') || data.type?.toLowerCase().includes('audio')) {
                    addEvent(`Potential Audio Error Detected: ${data.details || data.type}`, 'error');
                    // You could potentially update UI state here if needed, e.g., mark audio as errored
                    // qoeData.currentAudioCodec = 'ERROR';
                }

                updateQoEDisplay();
            };
            // Attach the single handler
            hls.on(Hls.Events.ERROR, genericErrorHandler);

            // Make sure to detach if needed on cleanup
            // window.addEventListener('beforeunload', () => {
            //     if (hls) {
            //         hls.off(Hls.Events.ERROR, genericErrorHandler);
            //     }
            // });

        } // End if(hls)
    } // End hookVideoAndHls

    // --- Dummy audioErrorHandler function just for the .off() call above ---
    // You can remove this if you didn't have a separate named function before.
    function audioErrorHandler() { }


    // -----------------------
    // Event history
    // -----------------------
    function addEvent(msg, type = '') {
        const ev = { time: new Date(), msg, type };
        qoeData.eventHistory.unshift(ev);
        if (qoeData.eventHistory.length > 100) qoeData.eventHistory.pop();
        renderHistory(); // Render history immediately after adding event
    }

    // ... (renderHistory, detectCDN remain the same) ...
    function renderHistory() {
        const container = document.getElementById('qoeEventHistory');
        if (!container) return;
        container.innerHTML = ''; // Clear previous history
        if (qoeData.eventHistory.length === 0) {
            container.innerHTML = '<div class="qoe-empty-history">No events recorded yet</div>';
            return;
        }
        qoeData.eventHistory.forEach(ev => {
            const div = document.createElement('div');
            div.className = 'qoe-history-event' + (ev.type ? ' event-' + ev.type : '');
            // Format timestamp and message
            div.innerHTML = `<span class="qoe-history-timestamp">[${ev.time.toLocaleTimeString()}]</span> ${ev.msg}`;
            container.appendChild(div);
        });
    }

    // -----------------------
    // CDN detection (Keep as is)
    // -----------------------
    function detectCDN(url, headers = {}) {
        if (!url) return; // Guard against null/undefined URL
        const u = url.toLowerCase();
        let cdn = 'Unknown';
        let currentCDN = qoeData.cdnProvider; // Get current value

        // URL‐based checks
        if (u.includes('akamaized.net') || u.includes('akamaihd.net') || u.includes('akamaitechnologies')) cdn = 'Akamai';
        else if (u.includes('edgekey.net') || u.includes('edgesuite.net')) cdn = 'Akamai'; // More Akamai TLDs
        else if (u.includes('llnwd.net') || u.includes('limelight')) cdn = 'Limelight (Edgio)';
        else if (u.includes('fastly')) cdn = 'Fastly';
        else if (u.includes('cloudfront.net')) cdn = 'CloudFront';
        else if (u.includes('cloudflare')) cdn = 'Cloudflare';
        else if (u.includes('level3.net') || u.includes('lumen.com')) cdn = 'Lumen (Level 3)';
        else if (u.includes('edgecastcdn.net') || u.includes('cedexis.com')) cdn = 'Verizon (Edgecast)';
        else if (u.includes('hwcdn.net')) cdn = 'Highwinds (StackPath)';
        else if (u.includes('azioncdn.net')) cdn = 'Azion';
        else if (u.includes('cdnetworks.net')) cdn = 'CDNetworks';
        else if (u.includes('incapdns.net')) cdn = 'Imperva';
        else if (u.includes('qwilt')) cdn = 'Qwilt'; // Keep Qwilt check
        else if (u.includes('jsdelivr.net')) cdn = 'jsDelivr'; // Keep jsDelivr


        // Header‐based checks (often more reliable) - case-insensitive header keys
        const lowerCaseHeaders = {};
        for (const key in headers) {
            lowerCaseHeaders[key.toLowerCase()] = headers[key];
        }

        if (lowerCaseHeaders['server']?.toLowerCase().includes('cloudflare')) cdn = 'Cloudflare';
        if (lowerCaseHeaders['cf-ray'] || lowerCaseHeaders['cf-cache-status']) cdn = 'Cloudflare';
        if (lowerCaseHeaders['x-amz-cf-id'] || lowerCaseHeaders['x-amz-cf-pop']) cdn = 'CloudFront';
        if (lowerCaseHeaders['x-cache']?.includes('cloudfront')) cdn = 'CloudFront'; // Alternative header
        if (lowerCaseHeaders['server']?.toLowerCase().includes('awselb')) cdn = 'AWS ELB/CloudFront'; // Could be behind ELB
        if (lowerCaseHeaders['x-served-by'] && lowerCaseHeaders['x-served-by'].includes('cache-')) cdn = 'Fastly';
        if (lowerCaseHeaders['x-fastly-backend-reqs']) cdn = 'Fastly'; // Alternative Fastly header
        if (lowerCaseHeaders['server']?.toLowerCase().startsWith('ecs')) cdn = 'Verizon (Edgecast)';
        if (lowerCaseHeaders['x-ec-debug']) cdn = 'Verizon (Edgecast)'; // Alternative Edgecast
        if (lowerCaseHeaders['server']?.toLowerCase().includes('gse')) cdn = 'Google Cloud CDN';
        if (lowerCaseHeaders['via']?.includes('google')) cdn = 'Google Cloud CDN';
        if (lowerCaseHeaders['x-hw']?.length > 0) cdn = 'Highwinds (StackPath)'; // Stackpath/Highwinds
        if (lowerCaseHeaders['x-powered-by-nitrosell']) cdn = 'Imperva'; // Example custom
        if (lowerCaseHeaders['x-cdn']?.toLowerCase().includes('imperva')) cdn = 'Imperva';
        if (lowerCaseHeaders['x-iinfo']) cdn = 'Imperva'; // Another Imperva header
        // Akamai Specific: Often uses 'Server' or 'X-Akamai-Request-ID', 'X-Cache', 'X-Cache-Key'
        if (lowerCaseHeaders['server']?.toLowerCase().includes('akamai')) cdn = 'Akamai';
        if (lowerCaseHeaders['x-akamai-request-id']) cdn = 'Akamai';
        if (lowerCaseHeaders['x-cache']?.includes('from AkamaiGHost')) cdn = 'Akamai';
        // Limelight/Edgio
        if (lowerCaseHeaders['x-ll-cache-action']) cdn = 'Limelight (Edgio)';

        // Update only if CDN changed from Unknown or changed to a different known CDN
        if (cdn !== 'Unknown' && cdn !== currentCDN) {
            qoeData.cdnProvider = cdn;
            // Tag as 'cdn' so it picks up our dark-blue .event-cdn style
            addEvent(`CDN detected: ${cdn}`, 'cdn');
            // No need to call updateQoEDisplay here, FRAG_LOADED already does
        } else if (cdn === 'Unknown' && currentCDN === 'Unknown') {
            // Still unknown after checks
        }
    }


    // ... (calculateQoE - commented out, updateQoEDisplay core structure remains) ...
    // ... Need to update renderAudio slightly ...

    // -----------------------
    // Update all pieces of the UI
    // -----------------------
    function updateQoEDisplay() {
        // metrics rows (Keep existing logic, it uses qoeData properties)
        const rows = [
            ['cdnProvider', qoeData.cdnProvider],
            ['startupTime', qoeData.loadStart && qoeData.firstFrame ? ((qoeData.firstFrame - qoeData.loadStart) / 1000).toFixed(2) + 's' : 'N/A'],
            ['timeToFirstFrame', qoeData.startTime && qoeData.firstFrame ? ((qoeData.firstFrame - qoeData.startTime) / 1000).toFixed(2) + 's' : 'N/A'],
            ['qualitySwitches', qoeData.qualitySwitches],
            ['rebufferingEvents', qoeData.rebufferingEvents],
            ['avgRebufferDuration', qoeData.rebufferingDurations.length ?
                (qoeData.rebufferingDurations.reduce((a, b) => a + b, 0) / qoeData.rebufferingDurations.length).toFixed(2) + 's' : 'N/A'],
            ['currentBitrate', qoeData.currentBitrate
                ? (qoeData.currentBitrate / 1e6).toFixed(2) + ' Mbps'
                : 'N/A'],
            ['currentResolution', qoeData.currentResolution || 'N/A'], // <<< ADDED: Display Resolution
            ['playbackRate', qoeData.playbackRate + 'x']
        ];
        rows.forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val !== null && val !== undefined ? val : 'N/A'; // Ensure N/A for null/undefined
        });

        renderAudio(); // Update audio display
        renderSubs(); // Update subtitle display
        renderConnection(); // Update connection display
    }

    function renderAudio() {
        const container = document.getElementById('audioTracksContainer');
        if (!container) return;

        // Clear previous content
        container.innerHTML = '';

        if (!qoeData.audioTracks || qoeData.audioTracks.length === 0) {
            // Display message if no tracks (explicit or inferred) are available
            container.textContent = 'No audio track information available';
            // Optionally display the standalone codec if known even without a track entry
            // if (qoeData.currentAudioCodec && qoeData.currentAudioCodec !== '?') {
            //    container.textContent = `Muxed Audio Detected (Codec: ${qoeData.currentAudioCodec})`;
            // }
            return;
        }

        // Render each track (explicit or the single inferred one)
        qoeData.audioTracks.forEach(track => {
            const row = document.createElement('div');
            row.className = 'qoe-metric-row';

            const nameEl = document.createElement('span');
            nameEl.className = 'qoe-metric-name';
            // Add [Default] marker if applicable
            const nameText = `${track.name} (${track.language || 'und'})${track.default ? ' [Default]' : ''}`;
            nameEl.textContent = nameText;
            nameEl.title = `Track ID: ${track.id}`; // Add ID as tooltip

            const valEl = document.createElement('span');
            valEl.className = 'qoe-metric-value';
            // Use track.codec, fallback to global currentAudioCodec only if track.codec is missing/invalid
            const displayCodec = track.codec && track.codec !== '?' ? track.codec : qoeData.currentAudioCodec;
            valEl.textContent = displayCodec || '?'; // Display codec, fallback to '?'

            // <<< UPDATED: Highlight active track by comparing track.id with qoeData.currentAudioTrack >>>
            if (track.id === qoeData.currentAudioTrack) {
                nameEl.style.fontWeight = 'bold';
                nameEl.style.color = 'white'; // Ensure visibility against dark background if needed
                valEl.style.fontWeight = 'bold';
                valEl.style.color = '#b2d1f0';
            } else {
                // Style non-active tracks differently if desired
                nameEl.style.color = '#ccc'; // Lighter grey for non-active
                valEl.style.color = '#ccc';
            }

            row.appendChild(nameEl);
            row.appendChild(valEl);
            container.appendChild(row);
        });
    }

    // ... (renderSubs, renderConnection remain the same) ...
    function renderSubs() {
        const c = document.getElementById('subtitlesContainer');
        if (!c) return;
        c.innerHTML = ''; // Clear previous
        if (!qoeData.subtitleTracks || qoeData.subtitleTracks.length === 0) {
            c.textContent = 'No subtitle information available';
        } else {
            qoeData.subtitleTracks.forEach((t, i) => {
                const d = document.createElement('div');
                d.className = 'qoe-metric-row'; // Use same class as audio/connection for consistency?

                const nameEl = document.createElement('span');
                nameEl.className = 'qoe-metric-name';
                nameEl.textContent = `${t.name || 'Subtitle'} (${t.language || 'und'})${t.default ? ' [Default]' : ''}`;
                nameEl.title = `Track ID: ${t.id}`;

                // Maybe add a value span if there's something else to show (e.g., active status)
                // const valEl = document.createElement('span');
                // valEl.className = 'qoe-metric-value';
                // valEl.textContent = (hls && hls.subtitleTrack === t.id) ? 'Active' : ''; // Check if active

                d.appendChild(nameEl);
                // d.appendChild(valEl);
                c.appendChild(d);
            });
        }
    }

    function renderConnection() {
        // Helper to calculate average safely
        const safeAvg = (arr) => {
            if (!arr || arr.length === 0) return null;
            const sum = arr.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
            return sum / arr.length;
        };

        // 1) TCP throughput
        const avgTp = safeAvg(qoeData.throughput);
        document.getElementById('tcpThroughput').textContent = avgTp !== null ? (avgTp / 1e6).toFixed(2) + ' Mbps' : 'N/A';

        // 2) Download speed
        const avgDl = safeAvg(qoeData.downloadSpeed);
        let dlText = 'N/A';
        if (avgDl !== null) {
            dlText = avgDl >= 1e6
                ? (avgDl / 1e6).toFixed(2) + ' MB/s'
                : (avgDl / 1e3).toFixed(2) + ' KB/s';
        }
        document.getElementById('downloadSpeed').textContent = dlText;

        // 3) Connection type (and optional downlink/RTT)
        let connText = 'N/A';
        if (navigator.connection) {
            const c = navigator.connection;
            connText = c.effectiveType || 'unknown';
            if (typeof c.downlink === 'number') connText += ` (~${c.downlink.toFixed(1)} Mbps)`;
            if (typeof c.rtt === 'number') connText += `, RTT ${c.rtt} ms`;
        }
        document.getElementById('connectionType').textContent = connText;

        // 4) Average latency (first-byte)
        const avgLat = safeAvg(qoeData.latency);
        document.getElementById('latency').textContent = avgLat !== null ? `${avgLat.toFixed(0)} ms` : 'N/A';
    }


    // --- Initial Setup Calls ---
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[qoe_ui] DOMContentLoaded');
        setupDetailTabs();
        updateQoEDisplay(); // Initial render with N/A values
        // Note: hookVideoAndHls is called later via 'hlsLoaded' event
    });

    // --- Player Loader Event ---
    document.addEventListener('hlsLoaded', e => {
        console.log('[qoe_ui] hlsLoaded event received');
        // const hlsInstance = e.detail.hls; // If passed in event detail
        // if (!hlsInstance && !window.hlsPlayerInstance) { // Check both
        //     console.warn('[qoe_ui] hlsLoaded fired but no Hls instance found');
        //     return;
        // }
        // hookVideoAndHls(hlsInstance || window.hlsPlayerInstance); // Pass the instance

        // Using original approach assuming window.hlsPlayerInstance is set correctly by player_loader
        if (!window.hlsPlayerInstance) {
            console.warn('[qoe_ui] hlsLoaded fired but window.hlsPlayerInstance not found');
            return;
        }
        hookVideoAndHls(); // Assumes hookVideoAndHls uses window.hlsPlayerInstance
        // updateQoEDisplay(); // hookVideoAndHls calls updateQoEDisplay internally via events
    });


})(); // End IIFE

console.log('[qoe_ui] QoE UI script finished.');
