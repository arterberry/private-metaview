document.addEventListener("DOMContentLoaded", function () {

    const closeButton = document.getElementById("closeButton");
    if (closeButton) {
        closeButton.addEventListener("click", function () {
            window.close();
        });
    } else {
        console.error("Close button not found");
    }

    // Initialize TTL display
    const cacheTtlDisplay = document.getElementById('cacheTtlDisplay');
    if (cacheTtlDisplay) {
        cacheTtlDisplay.innerHTML = "No TTL information available";
    }

    const playButton = document.getElementById("playVideo");
    if (playButton) {
        // First, save any existing onclick handler
        const originalHandler = playButton.onclick;

        // Clear the onclick property to avoid duplicate execution
        playButton.onclick = null;

        // Add event listener for resetting TTL info
        playButton.addEventListener("click", function () {
            // Reset TTL info
            latestTTLInfo = { hasDirectives: false };
            const cacheTtlDisplay = document.getElementById('cacheTtlDisplay');
            if (cacheTtlDisplay) {
                cacheTtlDisplay.innerHTML = "No TTL information available";
            }
        });

        // Add event listener for the main playback function
        playButton.addEventListener("click", handlePlayVideo);

        // If there was an original onclick handler, add it as another event listener
        if (originalHandler) {
            playButton.addEventListener("click", function (event) {
                originalHandler.call(this, event);
            });
        }
    }

    const helperLink = document.getElementById("playbackHelper");
    if (helperLink) {
        helperLink.addEventListener("click", function (e) {
            e.preventDefault();
            openHelperPopup();
        });
    } else {
        console.error("Playback helper link not found");
    }

    // Setup Admin button event listener
    const adminButton = document.getElementById('adminButton');
    if (adminButton) {
        adminButton.addEventListener('click', function () {
            console.log('Admin button clicked');
            openAdminPanel();
        });
    } else {
        console.error("Admin button not found");
    }

    // Setup SCTE explainer link
    const scteExplainer = document.getElementById("scteExplainer");
    if (scteExplainer) {
        scteExplainer.addEventListener("click", function (e) {
            e.preventDefault();
            openScteExplainer();
        });
    } else {
        console.error("SCTE explainer link not found");
    }

    // Setup Cache explainer link
    const cacheExplainer = document.getElementById("cacheExplainer");
    if (cacheExplainer) {
        cacheExplainer.addEventListener("click", function (e) {
            e.preventDefault();
            openCacheExplainer();
        });
    } else {
        console.error("Cache explainer link not found");
    }

    // New code: Tab system handling
    setupTabSystem();

    // Initialize cache graph
    initCacheGraph();

    // Initialize ad ratio graph
    initAdRatioGraph();
});

// Video playback
function handlePlayVideo() {
    let url = document.getElementById("hlsUrl").value;
    let video = document.getElementById("videoPlayer");

    // const isTestChannelURL = url.includes("/v1/live?") && 
    //                          (url.includes("k8s-sportsprod") || 
    //                           url.includes("k8s-sportsqa"));

    // if (!isTestChannelURL && !url.endsWith(".m3u8")) {
    //     alert("Please enter a valid HLS URL (.m3u8)");
    //     return;
    // }

    // Reset QoE monitoring if available
    if (window.qoeModule && window.qoeModule.qoeData) {
        window.qoeModule.qoeData.reset();
    }

    // Add this near the beginning of handlePlayVideo function (around line 102)
    // Reset SCTE data when starting a new stream
    console.log("Resetting SCTE data for new stream");
    scteData = {
        markers: [],
        adCuePoints: [],
        contentCuePoints: [],
        adDuration: 0,
        contentDuration: 0,
        adCount: 0,
        adCompletionRate: 100,
        lastUpdate: 0
    };

    // Show SCTE detail section
    document.getElementById('scteDetailSection').style.display = 'block';

    // Add a button to force SCTE detail visibility (for debugging)
    const scteDebugButton = document.createElement('button');
    scteDebugButton.textContent = 'Debug SCTE';
    scteDebugButton.style.position = 'fixed';
    scteDebugButton.style.bottom = '10px';
    scteDebugButton.style.right = '10px';
    scteDebugButton.style.zIndex = '9999';
    scteDebugButton.style.padding = '5px';
    scteDebugButton.style.display = 'none'; // Hidden by default, only for development

    scteDebugButton.addEventListener('click', function () {
        console.log('Current SCTE Data:', scteData);

        // Force show SCTE details
        const scteDetailSection = document.getElementById('scteDetailSection');
        if (scteDetailSection) {
            scteDetailSection.style.display = 'block';
        }

        // Update all SCTE displays
        updateScteDetailDisplay();
        updateScteDisplay();
        updateAdRatioGraph();
    });

    document.body.appendChild(scteDebugButton);

    if (typeof Hls !== "undefined" && Hls.isSupported()) {
        // An HLS instance with modified buffer settings
        let hls = new Hls({
            debug: true,                                // Enable debug logs
            loader: createCustomLoader(Hls),            // Use the custom loader
            maxBufferLength: 60,                        // Increase buffer length (default is 30 seconds)
            maxMaxBufferLength: 600,                    // Maximum buffer size (default is 600 seconds)
            maxBufferSize: 60 * 1000 * 1000,            // Maximum buffer size in bytes (60MB)
            maxBufferHole: 0.5,                         // Maximum buffer hole tolerance
            highBufferWatchdogPeriod: 3,                // Time to wait before trying to appending if buffer is full
            nudgeOffset: 0.1,                           // Tolerance to use when nudging stalled playback
            nudgeMaxRetry: 5,                           // Maximum number of nudge retries
            abrEwmaDefaultEstimate: 500000,             // Default bandwidth estimate (500kbps)
            abrEwmaFastLive: 3,                         // Fast EWMA coefficient for live streams
            abrEwmaSlowLive: 9,                         // Slow EWMA coefficient for live streams
            startLevel: -1,                             // Auto start level selection (-1 means auto)
            manifestLoadingTimeOut: 10000,              // Timeout for manifest loading
            manifestLoadingMaxRetry: 4,                 // Maximum retry attempts for manifest loading
            manifestLoadingRetryDelay: 1000,            // Initial retry delay for manifest loading
            manifestLoadingMaxRetryTimeout: 64000,      // Maximum retry timeout for manifest loading
        });

        // Event listeners for manifest loading and processing
        hls.on(Hls.Events.MANIFEST_LOADING, function (event, data) {
            console.log("Manifest loading:", data.url);
            addMetadataEntry(`Loading manifest: ${data.url}`);
        });

        // Initialize QoE monitoring
        if (window.qoeModule) {
            window.qoeModule.initQoEMonitoring(video, hls);
        }

        hls.on(Hls.Events.MANIFEST_LOADED, function (event, data) {
            console.log("Manifest loaded:", data);

            // Manifest info
            let manifestInfo = `
                Master manifest loaded:
                URL: ${data.url}
                Levels: ${data.levels.length}
            `;

            // Information about available quality levels
            data.levels.forEach((level, index) => {
                manifestInfo += `
                Level ${index}: ${level.width}x${level.height} @ ${Math.round(level.bitrate / 1000)}kbps
                `;
            });

            addMetadataEntry(manifestInfo);

            // Fetch the raw manifest content to look for SCTE markers
            fetchAndParseManifest(data.url);
        });

        hls.on(Hls.Events.LEVEL_LOADING, function (event, data) {
            console.log("Level loading:", data.url);
            addMetadataEntry(`Loading level manifest: ${data.url}`);

            // Fetch the media playlist to look for SCTE markers
            fetchAndParseManifest(data.url);
        });

        // Add event listeners for segment loading
        hls.on(Hls.Events.FRAG_LOADING, function (event, data) {
            console.log("Fragment loading:", data.frag.url);
            addMetadataEntry(`Loading segment: ${data.frag.sn} (${data.frag.url})`);
        });

        hls.on(Hls.Events.FRAG_LOADED, function (event, data) {
            console.log("Fragment loaded:", data.frag.url);
            let segmentInfo = `
                Segment ${data.frag.sn} loaded:
                Duration: ${data.frag.duration.toFixed(2)}s
                Level: ${data.frag.level}
            `;
            addMetadataEntry(segmentInfo);
        });

        // Monitor for errors
        hls.on(Hls.Events.ERROR, function (event, data) {

            console.error("HLS Error:", {
                type: data.type,
                details: data.details,
                fatal: data.fatal || false,
                error: data.error,
                url: data.frag ? data.frag.url : (data.context ? data.context.url : 'unknown')
            });

            let errorMessage = `HLS Error: ${data.details}`;
            if (data.response) {
                errorMessage += ` - Status: ${data.response.code}`;
            }
            if (data.error) {
                errorMessage += ` - ${data.error.message || data.error}`;
            }

            addMetadataEntry(errorMessage, true);

            if (data.fatal) {
                addMetadataEntry(`FATAL ERROR: ${data.details}`, true);
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.log("Fatal network error encountered, trying to recover");
                        hls.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.log("Fatal media error encountered, trying to recover");
                        hls.recoverMediaError();
                        break;
                    default:
                        hls.destroy();
                        break;
                }
            } else {
                addMetadataEntry(`Non-fatal error: ${data.details}`);
            }
        });

        // Load source / video
        hls.loadSource(url);
        parseAndDisplayResolutions(url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, function () {
            console.log("Manifest parsed, trying to play");
            video.play().catch(e => {
                console.error("Error playing video:", e);
                addMetadataEntry(`Play error: ${e.message}`, true);
            });
        });

        // Fetch and display initial manifest metadata
        fetchMetadata(url);

        // Add buffer state monitoring
        let bufferingIndicator = document.createElement('div');
        bufferingIndicator.id = 'bufferingIndicator';
        bufferingIndicator.textContent = 'Buffering...';
        bufferingIndicator.style.display = 'none';
        bufferingIndicator.style.position = 'absolute';
        bufferingIndicator.style.top = '50%';
        bufferingIndicator.style.left = '50%';
        bufferingIndicator.style.transform = 'translate(-50%, -50%)';
        bufferingIndicator.style.background = 'rgba(0, 0, 0, 0.7)';
        bufferingIndicator.style.color = 'white';
        bufferingIndicator.style.padding = '10px 20px';
        bufferingIndicator.style.borderRadius = '5px';
        bufferingIndicator.style.zIndex = '1000';
        document.querySelector('.video-container').appendChild(bufferingIndicator);

        // Monitor for buffer stalling
        hls.on(Hls.Events.ERROR, function (event, data) {
            if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
                bufferingIndicator.style.display = 'block';
                addMetadataEntry('Playback stalled due to insufficient buffer', true);
            }
        });

        // CHECK: Specific listener for buffer stalling
        hls.on(Hls.Events.BUFFER_STALLING, function () {
            bufferingIndicator.style.display = 'block';
            addMetadataEntry('Buffer stalling detected', true);
        });

        // CHECK: for buffering completion
        hls.on(Hls.Events.BUFFER_APPENDED, function () {
            if (video.readyState >= 3) { // HAVE_FUTURE_DATA or higher
                bufferingIndicator.style.display = 'none';
            }
        });

        // CHECK: video element buffering states
        video.addEventListener('waiting', function () {
            bufferingIndicator.style.display = 'block';
        });

        video.addEventListener('playing', function () {
            bufferingIndicator.style.display = 'none';
        });


    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.addEventListener("loadedmetadata", () => video.play());
    } else {
        alert("Your browser does not support HLS playback.");
    }
}

// Helper function to add entries to metadata list with a buffer
function addMetadataEntry(text, isError = false, isHighlighted = false) {
    // If metadataBuffer is available, use it (as defined in metadata.js)
    if (window.metadataBuffer && typeof window.metadataBuffer.addEntry === 'function') {
        return window.metadataBuffer.addEntry(text, isError, isHighlighted);
    }

    // Fallback to original implementation if buffer not available
    let metadataList = document.getElementById("metadataList");
    let entry = document.createElement("div");

    // Use innerHTML for formatting if needed
    if (text.includes('\n')) {
        entry.innerHTML = text.replace(/\n/g, '<br>');
    } else {
        entry.textContent = text;
    }

    if (isError) {
        entry.style.color = "red";
        entry.style.fontWeight = "bold";
    }

    if (isHighlighted) {
        entry.style.backgroundColor = "#fffbcd"; // Light yellow highlight
        entry.style.padding = "5px";
        entry.style.border = "1px solid #ffeb3b";
    }

    // Add timestamp
    let timestamp = new Date().toLocaleTimeString();
    let timeElement = document.createElement("span");
    timeElement.textContent = `[${timestamp}] `;
    timeElement.style.color = "#888";

    entry.prepend(timeElement);

    // Insert at the top
    if (metadataList.firstChild) {
        metadataList.insertBefore(entry, metadataList.firstChild);
    } else {
        metadataList.appendChild(entry);
    }

    // Add a separator
    let separator = document.createElement("hr");
    metadataList.insertBefore(separator, entry.nextSibling);
}

// Custom loader function to capture response headers
function createCustomLoader(Hls) {
    const XhrLoader = Hls.DefaultConfig.loader;
    class HeaderCaptureLoader extends XhrLoader {
        constructor(config) {
            super(config);
            const load = this.load.bind(this);

            this.load = function (context, config, callbacks) {
                // Store original callbacks
                const originalOnSuccess = callbacks.onSuccess;

                // Override success callback to capture headers
                callbacks.onSuccess = function (response, stats, context, xhr) {
                    // NOTE: access the headers
                    if (xhr && xhr.getAllResponseHeaders) {

                        // Debugging
                        console.log('Raw header string:', xhr.getAllResponseHeaders());

                        const headerString = xhr.getAllResponseHeaders();
                        const headers = {};

                        // Parse the header string
                        headerString.split('\r\n').forEach(line => {
                            if (line) {
                                const parts = line.split(': ');
                                const key = parts.shift();
                                const value = parts.join(': ');
                                headers[key] = value;
                            }
                        });

                        console.log('Segment response headers:', headers);

                        // Display headers in UI
                        if (context.url.includes('.ts') || context.url.includes('.m4s')) {
                            addHeadersToMetadata(context.url, headers);
                        }
                    }
                    // Call original callback
                    originalOnSuccess(response, stats, context, xhr);
                };
                // Call the original load method
                load(context, config, callbacks);
            };
        }
    }

    return HeaderCaptureLoader;
}

// Function to display headers in the UI
function addHeadersToMetadata(url, headers) {
    // Get segment filename from URL
    const filename = url.split('/').pop();

    // Create header display text
    let headerText = `Headers for ${filename}:\n`;

    // Check for cache hit/miss
    let cacheStatus = null;

    // Add ALL headers instead of just important ones
    if (headers) {
        // If headers is an object with key-value pairs
        Object.keys(headers).forEach(header => {
            headerText += `${header}: ${headers[header]}\n`;
            // Look for cache-related headers
            if (header.toLowerCase() === 'x-cache' ||
                header.toLowerCase() === 'cf-cache-status' ||
                header.toLowerCase() === 'x-cache-lookup' ||
                header.toLowerCase() === 'x-cache-hits' ||
                header.toLowerCase() === 'age') {

                const value = headers[header].toLowerCase();

                // Handle Akamai's specific x-cache-hits format (e.g., "0, 0")
                if (header.toLowerCase() === 'x-cache-hits') {
                    const hits = value.split(',').map(v => parseInt(v.trim()));
                    if (hits.some(hit => hit > 0)) {
                        cacheStatus = true;  // Cache hit
                    } else {
                        cacheStatus = false;  // Cache miss
                    }
                }
                // Handle standard cache headers
                else if (value.includes('hit') ||
                    (header.toLowerCase() === 'age' && parseInt(value) > 0)) {
                    cacheStatus = true;  // Cache hit
                } else if (value.includes('miss') ||
                    (header.toLowerCase() === 'age' && parseInt(value) === 0)) {
                    cacheStatus = false;  // Cache miss
                }
            }

            // Also check for Akamai-specific headers that might indicate cache status
            if (header.toLowerCase() === 'x-cdn' && headers[header].toLowerCase() === 'akamai') {
                // If we haven't determined cache status yet, look for other Akamai indicators
                if (cacheStatus === null) {
                    // Look for x-served-by header to try to determine cache status
                    const servedBy = headers['x-served-by'] || '';
                    if (servedBy.toLowerCase().includes('cache-')) {
                        // This is a heuristic - might need adjustment based on actual Akamai behavior
                        cacheStatus = servedBy.split(',').length > 1;
                    }
                }
            }
        });
    }

    // Update cache graph if we found a cache status
    if (cacheStatus !== null && url.includes('.ts')) {
        updateCacheGraph(cacheStatus);
    }

    // Add TTL extraction here - OUTSIDE the loop
    if (url.includes('.ts') || url.includes('.m4s') || url.includes('.m3u8')) {
        const ttlInfo = extractTTLInfo(headers);
        if (ttlInfo.hasDirectives) {
            // Update the latest TTL info
            latestTTLInfo = ttlInfo;
            // Update the display
            updateCacheTTLDisplay(ttlInfo);
        }
    }

    // Add to metadata panel
    addMetadataEntry(headerText);
}

// Function to fetch and parse manifests for SCTE and other metadata
async function fetchAndParseManifest(url) {
    try {
        // Add a timeout to prevent long-hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(url, {
            signal: controller.signal,
            // Add mode and credentials options for CORS
            mode: 'cors',
            credentials: 'omit',
            headers: {
                'Accept': '*/*'
            }
        });

        clearTimeout(timeoutId);

        const headers = {};

        // Get response headers
        response.headers.forEach((value, key) => {
            headers[key] = value;
        });

        // Log headers
        console.log(`Manifest headers for ${url}:`, headers);

        // Display headers in metadata panel
        let headerText = `Manifest headers for ${url.split('/').pop()}:\n`;
        Object.keys(headers).forEach(header => {
            headerText += `${header}: ${headers[header]}\n`;
        });
        addMetadataEntry(headerText);

        const text = await response.text();

        // Track important context markers for better ad detection
        let foundKeyMethodNone = false;
        let foundKeyMethodAES = false;
        let foundDiscontinuity = false;
        let foundProgramDateTimeChanges = false;
        let lastProgramDateTime = null;

        // Look for SCTE markers and other important tags
        const scteLines = [];
        const otherMetadata = [];

        // Get current video time if available
        const videoElement = document.getElementById('videoPlayer');
        const currentTime = videoElement ? videoElement.currentTime : 0;

        let foundScteMarkers = false;

        text.split('\n').forEach(line => {
            const trimmedLine = line.trim();

            // Track encryption method changes which can signal content transitions
            if (/^#EXT-X-KEY:METHOD=NONE(?:$|\s|;)/.test(trimmedLine)) {
                foundKeyMethodNone = true;
            } else if (/^#EXT-X-KEY:METHOD=AES-128(?:$|\s|;)/.test(trimmedLine)) {
                foundKeyMethodAES = true;
            }

            // Track program date time changes
            if (/^#EXT-X-PROGRAM-DATE-TIME:/.test(trimmedLine)) {
                const dateMatch = trimmedLine.match(/^#EXT-X-PROGRAM-DATE-TIME:(.+?)(?:Z|$)/);
                if (dateMatch && dateMatch[1]) {
                    const currentDateTime = new Date(dateMatch[1] + (dateMatch[1].endsWith('Z') ? '' : 'Z')).getTime();
                    if (lastProgramDateTime) {
                        // Check for non-sequential jumps in program date time
                        const diff = Math.abs(currentDateTime - lastProgramDateTime);
                        // If more than 5 seconds gap, might indicate content boundary
                        if (diff > 5000) {
                            foundProgramDateTimeChanges = true;
                        }
                    }
                    lastProgramDateTime = currentDateTime;
                }
            }

            // Look for SCTE-35 related tags with more precise matching
            if (/^#EXT-X-SCTE35:|^#EXT-X-CUE:|^#EXT-X-CUE-OUT|^#EXT-X-CUE-IN|^#EXT-X-DATERANGE|^#EXT-X-MARKER|^#EXT-X-DISCONTINUITY$/.test(trimmedLine)) {
                scteLines.push(trimmedLine);

                // Exact match for discontinuity tag
                foundDiscontinuity = foundDiscontinuity || trimmedLine === '#EXT-X-DISCONTINUITY';

                // Process for SCTE tracking with proper time context
                const newMarkerProcessed = processSCTEMarker(trimmedLine, currentTime);
                if (newMarkerProcessed) {
                    foundScteMarkers = true;
                    console.log(`Processed SCTE marker: ${trimmedLine}`);
                }
            }
            // Capture other metadata tags with more precise matching
            else if (/^#EXT(?!INF|(?:-X-BYTERANGE))/.test(trimmedLine)) {
                otherMetadata.push(trimmedLine);
            }
        });

        // Additional processing for discontinuity markers in context
        if (foundDiscontinuity && !foundScteMarkers && (foundKeyMethodNone || foundKeyMethodAES || foundProgramDateTimeChanges)) {
            // Store context for better discontinuity processing
            window.streamContext = {
                foundKeyMethodNone: foundKeyMethodNone,
                foundKeyMethodAES: foundKeyMethodAES,
                foundProgramDateTimeChanges: foundProgramDateTimeChanges,
                url: url
            };

            console.log("Detected potential content transition markers:", window.streamContext);
        }

        // Display SCTE markers if found
        if (scteLines.length > 0) {
            let scteInfo = `SCTE markers in ${url.split('/').pop()}:\n`;
            scteLines.forEach(line => {
                scteInfo += `${line}\n`;
            });
            addMetadataEntry(scteInfo, false, true); // Highlight SCTE info

            // Show SCTE detail section if we found markers
            document.getElementById('scteDetailSection').style.display = 'block';

            // Add toggle link if not already present
            if (!document.getElementById('scteDetailToggle')) {
                const scteDisplay = document.getElementById('scteDisplay');
                const toggleLink = document.createElement('span');
                toggleLink.id = 'scteDetailToggle';
                toggleLink.className = 'scte-detail-toggle';
                toggleLink.textContent = 'Show SCTE-35 Details';
                toggleLink.addEventListener('click', toggleScteDetails);

                // Add it after the first child of scteDisplay
                if (scteDisplay.firstChild) {
                    scteDisplay.insertBefore(toggleLink, scteDisplay.firstChild.nextSibling);
                } else {
                    scteDisplay.appendChild(toggleLink);
                }
            }
        }

        // Display other metadata
        if (otherMetadata.length > 0) {
            let metadataInfo = `Metadata in ${url.split('/').pop()}:\n`;
            otherMetadata.forEach(line => {
                metadataInfo += `${line}\n`;
            });
            addMetadataEntry(metadataInfo);
        }
    } catch (error) {
        console.error("Error fetching manifest:", error);

        // Provide more detailed error message
        let errorMessage = `Error fetching manifest ${url}: `;

        if (error.name === 'AbortError') {
            errorMessage += 'Request timed out after 10 seconds';
        } else if (error.message.includes('NetworkError')) {
            errorMessage += 'Network error (possibly CORS related). This is common and non-critical for cross-origin requests.';
        } else {
            errorMessage += error.message;
        }

        // Mark as non-critical error if it's likely a CORS issue with a third-party URL
        const isCORSLikelyIssue = !url.includes(window.location.hostname) &&
            (error.message.includes('Failed to fetch') ||
                error.message.includes('NetworkError'));

        addMetadataEntry(errorMessage, !isCORSLikelyIssue);
    }
}

// Modify the processSCTEMarker function (around line 831)
function processSCTEMarker(marker, currentTime) {
    // Skip if this is a duplicate marker (based on time)
    if (scteData.markers.some(m => m.time === currentTime && m.marker === marker)) {
        return false;
    }

    // Handle discontinuity markers which often indicate ad boundaries
    let markerType = 'unknown';
    let duration = 0;
    let parsedScte35 = null;

    // Check for discontinuity which might indicate ad boundaries
    const isDiscontinuity = /^#EXT-X-DISCONTINUITY(?:$|\r|\n)/.test(marker);

    // Use our SCTE35Parser to extract data if available
    if (window.SCTE35Parser && !isDiscontinuity) {
        parsedScte35 = window.SCTE35Parser.extractFromHLSTags(marker);
    }

    if (parsedScte35) {
        console.log("Parsed SCTE-35 data:", parsedScte35);

        // Determine if this is an ad start or end based on the parsed data
        if (parsedScte35.spliceCommandType === 0x05 && parsedScte35.spliceCommandInfo) {
            // Splice Insert command
            if (!parsedScte35.spliceCommandInfo.spliceEventCancelIndicator) {
                markerType = parsedScte35.spliceCommandInfo.outOfNetworkIndicator ? 'ad-start' : 'ad-end';

                // Get duration if available
                if (parsedScte35.spliceCommandInfo.breakDuration) {
                    duration = parsedScte35.spliceCommandInfo.breakDuration.duration / 90000; // Convert from 90kHz to seconds
                }
            }
        } else if (parsedScte35.spliceCommandType === 0x07 && parsedScte35.descriptors) {
            // Time Signal command - check for segmentation descriptors
            const segDescriptors = parsedScte35.descriptors.filter(d => d.tag === 0x02);

            if (segDescriptors.length > 0 && segDescriptors[0].info) {
                const segInfo = segDescriptors[0].info;

                if (segInfo.isAdStart) {
                    markerType = 'ad-start';
                } else if (segInfo.isAdEnd) {
                    markerType = 'ad-end';
                }

                // Get duration if available
                if (segInfo.segmentationDuration) {
                    duration = segInfo.segmentationDuration / 90000; // Convert from 90kHz to seconds
                }
            }
        }
    } else if (marker.includes('CUE-OUT') || marker.includes('SCTE35-OUT')) {
        markerType = 'ad-start';
        // Try to extract duration if available (e.g., #EXT-X-CUE-OUT:30)
        const durationMatch = marker.match(/CUE-OUT:(\d+)/);
        if (durationMatch) {
            duration = parseInt(durationMatch[1], 10);
        }
    } else if (marker.includes('CUE-IN') || marker.includes('SCTE35-IN')) {
        markerType = 'ad-end';
    } else if (marker.includes('DATERANGE') && marker.includes('DURATION')) {
        // Extract information from DATERANGE tag
        const durationMatch = marker.match(/DURATION=(\d+(?:\.\d+)?)/);
        if (durationMatch) {
            duration = parseFloat(durationMatch[1]);
        }

        if (marker.includes('SCTE35-OUT')) {
            markerType = 'ad-start';
        } else if (marker.includes('SCTE35-IN')) {
            markerType = 'ad-end';
        }
    } else if (isDiscontinuity) {
        // If it's a discontinuity, use the dedicated handler
        return processDiscontinuityMarker(marker, currentTime);
    }

    // If we couldn't determine marker type, don't process it
    if (markerType === 'unknown') {
        console.log("Unknown marker type, not processing");
        return false;
    }

    console.log(`Marker processed as type: ${markerType}, duration: ${duration}`);

    // Add to markers list with debugging info
    scteData.markers.push({
        time: currentTime,
        marker: marker,
        type: markerType,
        duration: duration,
        parsed: parsedScte35,
        description: isDiscontinuity ? "Discontinuity marker (ad boundary)" :
            parsedScte35 ? window.SCTE35Parser.getHumanReadableDescription(parsedScte35) :
                "SCTE-35 marker"
    });

    // Update ad/content tracking
    updateAdTracking(markerType, duration, currentTime);

    // Update SCTE details display
    updateScteDetailDisplay();

    // Update the main display
    updateScteDisplay();

    // Return true if we processed a new marker
    return true;
}

// Add function to toggle SCTE details display
// Add toggle function for SCTE details
function toggleScteDetails(e) {
    if (e) e.preventDefault();

    const detailSection = document.getElementById('scteDetailSection');
    const toggleLink = document.getElementById('scteDetailToggle');

    if (!detailSection || !toggleLink) return;

    if (detailSection.style.display === 'none') {
        detailSection.style.display = 'block';
        toggleLink.textContent = 'Hide SCTE-35 Details';
    } else {
        detailSection.style.display = 'none';
        toggleLink.textContent = 'Show SCTE-35 Details';
    }
}

// Update SCTE details display
function updateScteDetailDisplay() {
    const container = document.getElementById('scteDetailContainer');
    if (!container) return;

    // Clear container
    container.innerHTML = '';

    if (scteData.markers.length === 0) {
        container.innerHTML = '<div class="scte-detail-empty">No SCTE-35 signals decoded yet</div>';
        return;
    }

    // Get the last 5 markers (most recent first)
    const recentMarkers = scteData.markers.slice(-5).reverse();

    // Add each marker to the display
    recentMarkers.forEach(marker => {
        const signalElement = document.createElement('div');
        signalElement.className = `scte-signal ${marker.type}`;

        // Create header with type and time
        const headerElement = document.createElement('div');
        headerElement.className = 'scte-signal-header';

        const typeElement = document.createElement('div');
        typeElement.className = 'scte-signal-type';
        typeElement.textContent = marker.type === 'ad-start' ? 'Ad Start' :
            marker.type === 'ad-end' ? 'Ad End' : 'Marker';

        const timeElement = document.createElement('div');
        timeElement.className = 'scte-signal-time';
        timeElement.textContent = `Time: ${marker.time.toFixed(2)}s`;

        headerElement.appendChild(typeElement);
        headerElement.appendChild(timeElement);

        // Create description
        const descriptionElement = document.createElement('div');
        descriptionElement.className = 'scte-signal-description';
        descriptionElement.textContent = marker.description || 'SCTE-35 Signal';

        // Create details element if we have parsed data
        let detailsElement = null;
        if (marker.parsed) {
            detailsElement = document.createElement('div');
            detailsElement.className = 'scte-signal-details';

            // Add command type
            if (marker.parsed.spliceCommandTypeName) {
                detailsElement.textContent += `Command: ${marker.parsed.spliceCommandTypeName}`;
            }

            // Add event ID if available
            if (marker.parsed.spliceCommandInfo && marker.parsed.spliceCommandInfo.spliceEventId !== undefined) {
                detailsElement.textContent += ` | Event ID: ${marker.parsed.spliceCommandInfo.spliceEventId}`;
            }

            // Add PTS time if available
            if (marker.parsed.spliceCommandInfo &&
                marker.parsed.spliceCommandInfo.spliceTime &&
                marker.parsed.spliceCommandInfo.spliceTime.ptsTime) {
                const ptsFormatted = window.formatScteTime ?
                    window.formatScteTime(marker.parsed.spliceCommandInfo.spliceTime.ptsTime) :
                    marker.parsed.spliceCommandInfo.spliceTime.ptsTime;
                detailsElement.textContent += ` | PTS: ${ptsFormatted}`;
            }

            // Add duration if available (formatted)
            if (marker.duration) {
                detailsElement.textContent += ` | Duration: ${marker.duration.toFixed(1)}s`;
            }
        }

        // Assemble the signal element
        signalElement.appendChild(headerElement);
        signalElement.appendChild(descriptionElement);
        if (detailsElement) signalElement.appendChild(detailsElement);

        container.appendChild(signalElement);
    });

    // Update timeline
    updateScteTimeline();
}

// Update SCTE timeline
function updateScteTimeline() {
    const timeline = document.getElementById('scteTimeline');
    if (!timeline) return;

    // Clear timeline
    timeline.innerHTML = '';

    // Get video duration
    const video = document.getElementById('videoPlayer');
    if (!video || !video.duration) return;

    const duration = video.duration;
    const width = timeline.clientWidth;

    // Add markers to timeline
    scteData.markers.forEach(marker => {
        if (marker.time <= duration) {
            const position = (marker.time / duration) * width;

            const markerElement = document.createElement('div');
            markerElement.className = `scte-marker-point ${marker.type}`;
            markerElement.style.left = `${position}px`;

            // Add tooltip with time and description
            markerElement.title = `${marker.type === 'ad-start' ? 'Ad Start' : 'Ad End'} at ${marker.time.toFixed(2)}s`;

            timeline.appendChild(markerElement);
        }
    });
}

// // Function to fetch metadata (placeholder - you may need to implement this)
// function fetchMetadata(url) {
//     console.log("Fetching metadata for:", url);
//     // Implementation depends on what metadata you want to fetch
// }

// Function to parse and display available resolutions
function parseAndDisplayResolutions(manifestUrl) {
    fetch(manifestUrl)
        .then(response => response.text())
        .then(data => {
            const resolutionList = document.getElementById('resolutionList');
            resolutionList.innerHTML = '';

            const lines = data.split('\n');
            let resolutionCount = 0;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                if (line.includes('#EXT-X-STREAM-INF:') && line.includes('RESOLUTION=')) {
                    resolutionCount++;

                    // Extract resolution information
                    const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
                    const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);

                    if (resolutionMatch) {
                        const resolution = resolutionMatch[1];
                        const bandwidth = bandwidthMatch ?
                            Math.round(bandwidthMatch[1] / 1000) + ' kbps' : 'unknown';

                        const resItem = document.createElement('div');
                        resItem.className = 'resolution-item';
                        resItem.textContent = `${resolutionCount}. Resolution: ${resolution}, Bandwidth: ${bandwidth}`;
                        resolutionList.appendChild(resItem);
                    }
                }
            }

            if (resolutionCount === 0) {
                resolutionList.innerHTML += '<div>No resolution variants found</div>';
            }
        })
        .catch(error => {
            console.error('Error fetching manifest for resolutions:', error);
            const resolutionList = document.getElementById('resolutionList');
            resolutionList.innerHTML = '<div style="color: red;">Error fetching resolution information</div>';
        });
}


function openHelperPopup() {
    // Calculate center position for the popup
    const width = 600;
    const height = 600;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);

    // Open a new window
    const helperWindow = window.open('helper.html', 'playbackHelper',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);

    // Focus the new window
    if (helperWindow) {
        helperWindow.focus();
    } else {
        alert("Popup blocked. Please allow popups for this site.");
    }
}

// Function to open the Admin panel
function openAdminPanel() {
    // Calculate center position for the popup
    const width = 500;
    const height = 600;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);

    // Open a new window
    const adminWindow = window.open('admin.html', 'adminPanel',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);

    // Focus the new window
    if (adminWindow) {
        adminWindow.focus();
    } else {
        alert("Popup blocked. Please allow popups for this site.");
    }
}

// Cache hit/miss tracking
let cacheData = {
    hits: 0,
    misses: 0,
    total: 0,
    history: [],  // Array of 1s (hit) and 0s (miss)
    maxHistory: 20 // Keep track of last 20 segments
};

// Initialize the cache graph
function initCacheGraph() {
    const canvas = document.getElementById('cacheHitMissGraph');
    if (!canvas || !canvas.getContext) return;

    const ctx = canvas.getContext('2d');

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the baseline
    ctx.beginPath();
    ctx.strokeStyle = '#ccc';  // Changed from #666 to #ccc to match drawCacheGraph
    ctx.lineWidth = 1;
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    addTextLabelsToGraph();
}

function addTextLabelsToGraph() {
    const graphContainer = document.querySelector('.cache-graph-container');

    if (getComputedStyle(graphContainer).position === 'static') {
        graphContainer.style.position = 'relative';
    }

    // Remove existing labels if they exist
    const existingHitLabel = document.getElementById('hitLabel');
    const existingMissLabel = document.getElementById('missLabel');
    if (existingHitLabel) existingHitLabel.remove();
    if (existingMissLabel) existingMissLabel.remove();

    // Add HIT label
    const hitLabel = document.createElement('div');
    hitLabel.textContent = 'HIT';
    hitLabel.id = 'hitLabel';
    hitLabel.style.position = 'absolute';
    hitLabel.style.top = '10px';
    hitLabel.style.left = '10px';
    hitLabel.style.fontSize = '10px';
    hitLabel.style.fontFamily = 'Arial, sans-serif';
    hitLabel.style.color = '#666';
    graphContainer.appendChild(hitLabel);

    // Add MISS label
    const missLabel = document.createElement('div');
    missLabel.textContent = 'MISS';
    missLabel.id = 'missLabel';
    missLabel.style.position = 'absolute';
    missLabel.style.bottom = '20px';
    missLabel.style.left = '10px';
    missLabel.style.fontSize = '10px';
    missLabel.style.fontFamily = 'Arial, sans-serif';
    missLabel.style.color = '#666';
    graphContainer.appendChild(missLabel);
}

// Update the cache graph with new data
function updateCacheGraph(isHit) {
    // Update cache stats
    if (isHit) {
        cacheData.hits++;
    } else {
        cacheData.misses++;
    }
    cacheData.total++;

    // Add to history (1 for hit, 0 for miss)
    cacheData.history.push(isHit ? 1 : 0);

    // Keep history at max length
    if (cacheData.history.length > cacheData.maxHistory) {
        cacheData.history.shift();
    }

    // Make cacheData available globally for our exporter
    window.cacheData = cacheData;

    // Update hit ratio display
    const hitRatio = cacheData.total > 0 ?
        ((cacheData.hits / cacheData.total) * 100).toFixed(1) : 0;

    const hitRatioElement = document.getElementById('hitRatio');
    if (hitRatioElement) {
        hitRatioElement.textContent = `Hit ratio: ${hitRatio}%`;
    }

    const segmentCountElement = document.getElementById('segmentCount');
    if (segmentCountElement) {
        segmentCountElement.textContent = `Segments: ${cacheData.total}`;
    }

    // Draw the graph
    drawCacheGraph();
}

// Draw the cache hit/miss graph
function drawCacheGraph() {
    const canvas = document.getElementById('cacheHitMissGraph');
    if (!canvas || !canvas.getContext || cacheData.history.length === 0) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear the canvas
    ctx.clearRect(0, 0, width, height);

    // Draw the baseline
    ctx.beginPath();
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;  // Changed from 0.05 to 1 to match initCacheGraph
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Add the labels
    addTextLabelsToGraph();

    // Draw the line graph
    if (cacheData.history.length > 1) {
        const dataLength = cacheData.history.length;
        const stepSize = (width - 40) / (dataLength - 1);

        // Draw line connecting points
        ctx.beginPath();
        ctx.strokeStyle = '#2196F3';  // Blue line
        ctx.lineWidth = 1;

        for (let i = 0; i < dataLength; i++) {
            const x = 30 + (i * stepSize);
            // If hit (1), draw near top, if miss (0), draw near bottom
            const y = cacheData.history[i] === 1 ? height * 0.25 : height * 0.75;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        // Draw points
        for (let i = 0; i < dataLength; i++) {
            const x = 30 + (i * stepSize);
            const y = cacheData.history[i] === 1 ? height * 0.25 : height * 0.75;

            ctx.beginPath();
            ctx.fillStyle = cacheData.history[i] === 1 ? '#4CAF50' : '#F44336';  // Green for hit, red for miss
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();

            // // Draw small vertical line (pip)
            // ctx.beginPath();
            // ctx.strokeStyle = isHit ? '#4CAF50' : '#F44336';  // Green for hit, red for miss
            // ctx.lineWidth = 2;  // Width of the vertical line

            // // For a vertical line: draw from 3px above to 3px below the point
            // ctx.moveTo(x, y - 3);
            // ctx.lineTo(x, y + 3);
            // ctx.stroke();            
        }
    }
}

// Function to handle tab switching
// Update existing setupTabSystem function
function setupTabSystem() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(button => {
        button.addEventListener('click', function () {
            // Get the target tab
            const targetTab = this.getAttribute('data-tab');

            // Deactivate all tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));

            // Activate the selected tab
            this.classList.add('active');
            document.getElementById(`${targetTab}-tab`).classList.add('active');

            // Update any visualizations if needed
            if (targetTab === 'inspect') {
                // If we're showing the inspect tab, refresh the cache graph
                if (typeof drawCacheGraph === 'function') {
                    drawCacheGraph();
                }

                // Also refresh the ad ratio graph
                if (typeof updateAdRatioGraph === 'function') {
                    updateAdRatioGraph();
                }
            }
        });
    });
}

// Extracts TTL information from headers
function extractTTLInfo(headers) {
    const ttlInfo = {
        cacheControl: null,
        expires: null,
        age: null,
        maxAge: null,
        hasDirectives: false
    };

    // Check for Cache-Control header
    if (headers['cache-control']) {
        ttlInfo.cacheControl = headers['cache-control'];
        ttlInfo.hasDirectives = true;

        // Extract max-age if present
        const maxAgeMatch = headers['cache-control'].match(/max-age=(\d+)/i);
        if (maxAgeMatch && maxAgeMatch[1]) {
            ttlInfo.maxAge = parseInt(maxAgeMatch[1]);
        }
    }

    // Check for Expires header
    if (headers['expires']) {
        ttlInfo.expires = headers['expires'];
        ttlInfo.hasDirectives = true;
    }

    // Check for Age header
    if (headers['age']) {
        ttlInfo.age = parseInt(headers['age']);
        ttlInfo.hasDirectives = true;
    }

    return ttlInfo;
}

// Formats TTL information for display
function formatTTLDisplay(ttlInfo) {
    if (!ttlInfo.hasDirectives) {
        return "No cache TTL information available";
    }

    let displayHtml = '';

    // Format max-age if available
    if (ttlInfo.maxAge !== null) {
        const formatTime = (seconds) => {
            if (seconds < 60) return `${seconds} seconds`;
            if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
            if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
            return `${Math.floor(seconds / 86400)} days`;
        };

        displayHtml += `<div class="ttl-info">
            <span>Max Age:</span>
            <span class="ttl-value">${formatTime(ttlInfo.maxAge)}</span>
        </div>`;
    }

    // Format age if available
    if (ttlInfo.age !== null) {
        displayHtml += `<div class="ttl-info">
            <span>Current Age:</span>
            <span class="ttl-value">${ttlInfo.age} seconds</span>
        </div>`;
    }

    // Format remaining time if both max-age and age are available
    if (ttlInfo.maxAge !== null && ttlInfo.age !== null) {
        const remaining = Math.max(0, ttlInfo.maxAge - ttlInfo.age);
        displayHtml += `<div class="ttl-info">
            <span>Remaining TTL:</span>
            <span class="ttl-value">${remaining} seconds</span>
        </div>`;
    }

    // Format expires if available
    if (ttlInfo.expires) {
        try {
            const expiresDate = new Date(ttlInfo.expires);
            const now = new Date();
            const diff = (expiresDate - now) / 1000; // in seconds

            displayHtml += `<div class="ttl-info">
                <span>Expires:</span>
                <span class="ttl-value">${expiresDate.toLocaleTimeString()} (${diff > 0 ? 'in' : 'expired'} ${Math.abs(Math.round(diff))}s)</span>
            </div>`;
        } catch (e) {
            // Handle invalid date format
            displayHtml += `<div class="ttl-info">
                <span>Expires:</span>
                <span class="ttl-value">${ttlInfo.expires}</span>
            </div>`;
        }
    }

    // Show raw cache-control directives in a horizontal row
    if (ttlInfo.cacheControl) {
        const directives = ttlInfo.cacheControl.split(',').map(d => d.trim());

        displayHtml += `<div class="ttl-info">
            <span>Directives:</span>
            <span class="ttl-directives-container">`;

        directives.forEach(directive => {
            displayHtml += `<span class="ttl-directive">${directive}</span>`;
        });

        displayHtml += `</span></div>`;
    }

    return displayHtml;
}

// Update the Cache TTL display
function updateCacheTTLDisplay(ttlInfo) {
    const cacheTtlDisplay = document.getElementById('cacheTtlDisplay');
    if (cacheTtlDisplay) {
        cacheTtlDisplay.innerHTML = formatTTLDisplay(ttlInfo);
    }
}

// Store the latest TTL information
let latestTTLInfo = {
    hasDirectives: false
};

// Store SCTE-35 tracking data
let scteData = {
    markers: [],
    adCuePoints: [],
    contentCuePoints: [],
    adDuration: 0,
    contentDuration: 0,
    adCount: 0,
    adCompletionRate: 100,
    lastUpdate: 0
};

// Initialize the ad ratio graph
function initAdRatioGraph() {
    const canvas = document.getElementById('adRatioGraph');
    if (!canvas || !canvas.getContext) return;

    const ctx = canvas.getContext('2d');

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw placeholder text
    ctx.fillStyle = '#999';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('No ad markers detected', canvas.width / 2, canvas.height / 2);
}

// Update the ad ratio graph
function updateAdRatioGraph() {
    const canvas = document.getElementById('adRatioGraph');
    if (!canvas || !canvas.getContext) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear the canvas
    ctx.clearRect(0, 0, width, height);

    if (scteData.adDuration === 0 && scteData.contentDuration === 0) {
        // Draw placeholder text
        ctx.fillStyle = '#999';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No ad markers detected', width / 2, height / 2);
        return;
    }

    // Calculate ratio
    const totalDuration = scteData.adDuration + scteData.contentDuration;
    const adRatio = totalDuration > 0 ? (scteData.adDuration / totalDuration) : 0;

    // Draw content portion (red)
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(0, 0, width * (1 - adRatio), height);

    // Draw ad portion (green)
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(width * (1 - adRatio), 0, width * adRatio, height);

    // Draw divider line
    if (adRatio > 0 && adRatio < 1) {
        ctx.beginPath();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.moveTo(width * (1 - adRatio), 0);
        ctx.lineTo(width * (1 - adRatio), height);
        ctx.stroke();
    }

    // Draw labels
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Arial';

    // Content label (if large enough section)
    if (adRatio < 0.9) {
        ctx.textAlign = 'left';
        ctx.fillText('CONTENT', 5, height / 2 + 4);
    }

    // Ad label (if large enough section)
    if (adRatio > 0.1) {
        ctx.textAlign = 'right';
        ctx.fillText('ADS', width - 5, height / 2 + 4);
    }

    // Update ad ratio display
    const adRatioElement = document.getElementById('adRatio');
    if (adRatioElement) {
        adRatioElement.textContent = `Ad Ratio: ${(adRatio * 100).toFixed(1)}%`;
    }

    // Update ad count display
    const adCountElement = document.getElementById('adCount');
    if (adCountElement) {
        adCountElement.textContent = `Ads: ${scteData.adCount} (${scteData.adCompletionRate}% completed)`;
    }
}

// Process SCTE-35 marker
// function processSCTEMarker(marker, currentTime) {
//     // Skip if this is a duplicate marker (based on time)
//     if (scteData.markers.some(m => m.time === currentTime && m.marker === marker)) {
//         return false;
//     }

//     // Handle discontinuity markers which often indicate ad boundaries
//     let markerType = 'unknown';
//     let duration = 0;
//     let isDiscontinuity = marker.includes('#EXT-X-DISCONTINUITY');

//     console.log(`Processing potential SCTE marker: ${marker.substring(0, 30)}... at time ${currentTime}`);

//     if (marker.includes('CUE-OUT') || marker.includes('SCTE35-OUT')) {
//         markerType = 'ad-start';
//         // Try to extract duration if available
//         const durationMatch = marker.match(/CUE-OUT:(\d+)/);
//         if (durationMatch) {
//             duration = parseInt(durationMatch[1], 10);
//         }
//     } else if (marker.includes('CUE-IN') || marker.includes('SCTE35-IN')) {
//         markerType = 'ad-end';
//     } else if (marker.includes('DATERANGE') && marker.includes('SCTE35')) {
//         // Extract information from DATERANGE tag
//         const durationMatch = marker.match(/DURATION=(\d+(?:\.\d+)?)/);
//         if (durationMatch) {
//             duration = parseFloat(durationMatch[1]);
//         }

//         if (marker.includes('SCTE35-OUT')) {
//             markerType = 'ad-start';
//         } else if (marker.includes('SCTE35-IN')) {
//             markerType = 'ad-end';
//         }
//     } else if (isDiscontinuity) {
//         // For streams that use discontinuities to mark ad boundaries
//         // We'll use a pattern recognition approach based on the context

//         // Get current video time to help identify patterns
//         const video = document.getElementById('videoPlayer');
//         const videoTime = video ? video.currentTime : 0;

//         console.log(`Discontinuity at video time: ${videoTime}, marker time: ${currentTime}`);

//         // Use a more reliable method than odd/even counting
//         // Check if there's a pattern in the timing
//         const recentDiscontinuities = scteData.markers
//             .filter(m => m.marker.includes('DISCONTINUITY'))
//             .map(m => m.time);

//         // For this specific stream, check the pattern of discontinuities
//         // Most ad segments are introduced by discontinuities about 30 seconds apart
//         if (recentDiscontinuities.length >= 1) {
//             const lastTime = recentDiscontinuities[recentDiscontinuities.length - 1];
//             const timeDiff = currentTime - lastTime;

//             console.log(`Time since last discontinuity: ${timeDiff}s`);

//             // If timespan is around 30 seconds (typical ad length), 
//             // this could be the end of an ad segment
//             if (timeDiff >= 25 && timeDiff <= 35) {
//                 markerType = 'ad-end';
//                 console.log("Detected AD-END from discontinuity timing pattern");
//             } 
//             // If not the end of an ad, and we see "COMMERCIAL IN PROGRESS" text
//             // or a new discontinuity after longer content, mark as ad start
//             else if (timeDiff >= 60) {
//                 markerType = 'ad-start';
//                 duration = 30;  // Assume standard 30s duration
//                 console.log("Detected AD-START from discontinuity timing pattern");
//             }
//             // Alternative heuristic: check for discontinuities in groups
//             else if (timeDiff < 10) {
//                 // Closely spaced discontinuities might indicate ad boundary
//                 // Check how many we've seen in quick succession
//                 const groupSize = recentDiscontinuities.filter(t => 
//                     currentTime - t < 10).length;

//                 if (groupSize % 2 === 0) {
//                     markerType = 'ad-end';
//                     console.log("Detected AD-END from discontinuity group pattern");
//                 } else {
//                     markerType = 'ad-start';
//                     duration = 30;
//                     console.log("Detected AD-START from discontinuity group pattern");
//                 }
//             }
//         } else {
//             // If this is the first discontinuity, assume it's an ad start
//             markerType = 'ad-start';
//             duration = 30;  // Assume standard 30s duration
//             console.log("Detected first AD-START from discontinuity");
//         }
//     }

//     console.log(`Marker processed as type: ${markerType}, duration: ${duration}`);

//     // Add to markers list with debugging info
//     scteData.markers.push({
//         time: currentTime,
//         marker: marker,
//         type: markerType,
//         duration: duration,
//         description: isDiscontinuity ? "Discontinuity marker (ad boundary)" : "SCTE-35 marker"
//     });

//     // Update ad/content tracking
//     updateAdTracking(markerType, duration, currentTime);

//     // Update SCTE details display
//     updateScteDetailDisplay();

//     // Update the main display
//     updateScteDisplay();

//     // Return true if we processed a new marker
//     return true;
// }

// PART 2 - Update the processSCTEMarker function in popup.js
function processSCTEMarker(marker, currentTime) {
    // Skip if this is a duplicate marker (based on time)
    if (scteData.markers.some(m => m.time === currentTime && m.marker === marker)) {
        return false;
    }

    // Handle discontinuity markers which often indicate ad boundaries
    let markerType = 'unknown';
    let duration = 0;
    let parsedScte35 = null;
    // let isDiscontinuity = marker.includes('#EXT-X-DISCONTINUITY');
    let isDiscontinuity = /^#EXT-X-DISCONTINUITY(?:$|\r|\n)/.test(marker);

    console.log(`Processing potential SCTE marker: ${marker.substring(0, 30)}... at time ${currentTime}`);

    // Priority 1: Look for explicit SCTE-35 markers first
    if (marker.includes('CUE-OUT') || marker.includes('SCTE35-OUT')) {
        markerType = 'ad-start';
        // Try to extract duration if available
        const durationMatch = marker.match(/CUE-OUT:(\d+)/);
        if (durationMatch) {
            duration = parseInt(durationMatch[1], 10);
        }
    } else if (marker.includes('CUE-IN') || marker.includes('SCTE35-IN')) {
        markerType = 'ad-end';
    } else if (marker.includes('DATERANGE') && marker.includes('SCTE35')) {
        // Extract information from DATERANGE tag
        const durationMatch = marker.match(/DURATION=(\d+(?:\.\d+)?)/);
        if (durationMatch) {
            duration = parseFloat(durationMatch[1]);
        }

        if (marker.includes('SCTE35-OUT')) {
            markerType = 'ad-start';
        } else if (marker.includes('SCTE35-IN')) {
            markerType = 'ad-end';
        }
    }
    // Priority 2: Use SCTE35Parser for binary data extraction if available
    else if (window.SCTE35Parser && !isDiscontinuity) {
        parsedScte35 = window.SCTE35Parser.extractFromHLSTags(marker);

        if (parsedScte35) {
            console.log("Parsed SCTE-35 data:", parsedScte35);

            // Determine if this is an ad start or end based on the parsed data
            if (parsedScte35.spliceCommandType === 0x05 && parsedScte35.spliceCommandInfo) {
                // Splice Insert command
                if (!parsedScte35.spliceCommandInfo.spliceEventCancelIndicator) {
                    markerType = parsedScte35.spliceCommandInfo.outOfNetworkIndicator ? 'ad-start' : 'ad-end';

                    // Get duration if available
                    if (parsedScte35.spliceCommandInfo.breakDuration) {
                        duration = parsedScte35.spliceCommandInfo.breakDuration.duration / 90000; // Convert from 90kHz to seconds
                    }
                }
            } else if (parsedScte35.spliceCommandType === 0x07 && parsedScte35.descriptors) {
                // Time Signal command - check for segmentation descriptors
                const segDescriptors = parsedScte35.descriptors.filter(d => d.tag === 0x02);

                if (segDescriptors.length > 0 && segDescriptors[0].info) {
                    const segInfo = segDescriptors[0].info;

                    if (segInfo.isAdStart) {
                        markerType = 'ad-start';
                    } else if (segInfo.isAdEnd) {
                        markerType = 'ad-end';
                    }

                    // Get duration if available
                    if (segInfo.segmentationDuration) {
                        duration = segInfo.segmentationDuration / 90000; // Convert from 90kHz to seconds
                    }
                }
            }
        }
    }
    // Priority 3: Use discontinuity markers, but with more sophisticated heuristics
    else if (isDiscontinuity) {
        // Only use discontinuity as a last resort and with improved detection
        return processDiscontinuityMarker(marker, currentTime);
    }

    // If we couldn't determine marker type, don't process it
    if (markerType === 'unknown') {
        console.log("Unknown marker type, not processing");
        return false;
    }

    console.log(`Marker processed as type: ${markerType}, duration: ${duration}`);

    // Add to markers list with debugging info
    scteData.markers.push({
        time: currentTime,
        marker: marker,
        type: markerType,
        duration: duration,
        parsed: parsedScte35,
        description: isDiscontinuity ? "Discontinuity marker (ad boundary)" :
            parsedScte35 ? window.SCTE35Parser.getHumanReadableDescription(parsedScte35) :
                "SCTE-35 marker"
    });

    // Update ad/content tracking
    updateAdTracking(markerType, duration, currentTime);

    // Update SCTE details display
    updateScteDetailDisplay();

    // Update the main display
    updateScteDisplay();

    // Return true if we processed a new marker
    return true;
}

// Update the updateAdTracking function in popup.js
function updateAdTracking(markerType, duration, currentTime) {
    console.log(`Updating ad tracking: type=${markerType}, duration=${duration}, time=${currentTime}`);

    // Handle ad start marker
    if (markerType === 'ad-start') {
        // Check if we have an unmatched ad already in progress
        const openAds = scteData.adCuePoints.filter(ad => !ad.completed);

        // If we have more than one open ad, something is wrong - close the previous one
        if (openAds.length > 0) {
            console.warn(`Found ${openAds.length} uncompleted ads when processing a new ad-start. Closing previous ads.`);
            openAds.forEach(ad => {
                ad.completed = true;
                ad.endTime = currentTime;
                if (!ad.duration) {
                    const calculatedDuration = currentTime - ad.startTime;
                    ad.duration = calculatedDuration;
                }
            });
        }

        // Add new ad cue point
        scteData.adCuePoints.push({
            startTime: currentTime,
            duration: duration || 30, // Default to 30s if not specified
            endTime: duration ? (currentTime + duration) : null,
            completed: false
        });

        // Increment ad count
        scteData.adCount++;
        console.log(`Ad count incremented to ${scteData.adCount}`);

        // Add estimated duration to total
        const adDuration = duration || 30;
        scteData.adDuration += adDuration;
        console.log(`Ad duration increased by ${adDuration}s to ${scteData.adDuration}s`);
    }
    // Handle ad end marker
    else if (markerType === 'ad-end') {
        // Find the most recent uncompleted ad
        const uncompleted = scteData.adCuePoints.filter(ad => !ad.completed);
        if (uncompleted.length > 0) {
            const lastAd = uncompleted[uncompleted.length - 1];
            lastAd.completed = true;
            console.log(`Marked ad at ${lastAd.startTime}s as completed`);

            // If we didn't know the duration before, calculate it now
            if (!lastAd.duration && lastAd.startTime) {
                const calculatedDuration = currentTime - lastAd.startTime;
                lastAd.duration = calculatedDuration;
                lastAd.endTime = currentTime;

                // Update total ad duration
                scteData.adDuration += calculatedDuration;
                console.log(`Updated ad duration with calculated value: ${calculatedDuration}s, total: ${scteData.adDuration}s`);
            }
        } else {
            console.warn("Received ad-end marker with no corresponding ad-start");
        }
    }

    // Calculate ad completion rate
    const completedAds = scteData.adCuePoints.filter(ad => ad.completed).length;
    scteData.adCompletionRate = scteData.adCount > 0 ?
        Math.round((completedAds / scteData.adCount) * 100) : 100;

    console.log(`Ad completion rate: ${scteData.adCompletionRate}% (${completedAds}/${scteData.adCount})`);

    // Calculate content duration (improved approach)
    updateContentDuration();

    // Update the UI
    updateScteDisplay();
    updateAdRatioGraph();
}

// Add this new helper function for content duration calculation
function updateContentDuration() {
    const videoElement = document.getElementById('videoPlayer');
    if (!videoElement) return;

    // Use the video's current time as a reference for total viewed content
    const totalTime = videoElement.currentTime;

    if (totalTime <= 0) return;

    // Recalculate content duration as total time minus ad duration
    scteData.contentDuration = Math.max(0, totalTime - scteData.adDuration);
    console.log(`Updated content duration: ${scteData.contentDuration}s (total: ${totalTime}s, ads: ${scteData.adDuration}s)`);
}

// PART 3: Add this new function to popup.js
function processDiscontinuityMarker(marker, currentTime) {
    console.log(`Processing discontinuity marker at time: ${currentTime}`);

    // Get previous discontinuity times to analyze patterns
    const discontinuityTimes = scteData.markers
        .filter(m => /^#EXT-X-DISCONTINUITY(?:$|\r|\n)/.test(m.marker))
        .map(m => m.time);

    // If this is the first discontinuity, assume it's an ad start
    if (discontinuityTimes.length === 0) {
        console.log("First discontinuity detected, treating as AD-START");

        // Add to markers list with a default duration
        scteData.markers.push({
            time: currentTime,
            marker: marker,
            type: 'ad-start',
            duration: 30, // Default duration of 30s
            description: "Discontinuity marker (assumed ad start)"
        });

        // Update tracking
        updateAdTracking('ad-start', 30, currentTime);
        updateScteDetailDisplay();
        updateScteDisplay();

        return true;
    }

    // For subsequent discontinuities, alternate between ad-end and ad-start
    // This works well for standard HLS streams where discontinuities mark boundaries
    const lastDiscontinuityMarker = scteData.markers
        .filter(m => /^#EXT-X-DISCONTINUITY(?:$|\r|\n)/.test(m.marker))
        .pop();

    // Check if we have any type assignment for the last marker
    if (lastDiscontinuityMarker && lastDiscontinuityMarker.type) {
        // Alternate: if last was 'ad-start', this is 'ad-end' and vice versa
        const markerType = lastDiscontinuityMarker.type === 'ad-start' ? 'ad-end' : 'ad-start';
        const duration = markerType === 'ad-start' ? 30 : 0; // Only ad-start needs duration

        console.log(`Detected discontinuity as ${markerType} based on alternating pattern`);

        // Add to markers list
        scteData.markers.push({
            time: currentTime,
            marker: marker,
            type: markerType,
            duration: duration,
            description: `Discontinuity marker (detected ${markerType})`
        });

        // Update tracking
        updateAdTracking(markerType, duration, currentTime);
        updateScteDetailDisplay();
        updateScteDisplay();

        return true;
    } else {
        // If we got here, the last discontinuity didn't have a type assigned
        // Default to ad-start for even discontinuities, ad-end for odd
        const isEven = discontinuityTimes.length % 2 === 0;
        const markerType = isEven ? 'ad-start' : 'ad-end';
        const duration = markerType === 'ad-start' ? 30 : 0;

        console.log(`Detected discontinuity as ${markerType} based on count parity`);

        // Add to markers list
        scteData.markers.push({
            time: currentTime,
            marker: marker,
            type: markerType,
            duration: duration,
            description: `Discontinuity marker (detected ${markerType})`
        });

        // Update tracking
        updateAdTracking(markerType, duration, currentTime);
        updateScteDetailDisplay();
        updateScteDisplay();

        return true;
    }
}

// Update the updateScteDisplay function (around line 1016)
function updateScteDisplay() {
    const scteDisplay = document.getElementById('scteDisplay');
    if (!scteDisplay) return;

    // Make sure SCTE details section is visible if we have markers
    if (scteData.markers.length > 0) {
        const detailSection = document.getElementById('scteDetailSection');
        if (detailSection) {
            detailSection.style.display = 'block';
        }
    }

    if (scteData.markers.length === 0) {
        scteDisplay.innerHTML = "No SCTE-35 markers detected";
        return;
    }

    let displayHtml = '';

    // Add ad break count and completion rate
    displayHtml += `<div class="scte-info">
        <span>Ad Breaks:</span>
        <span class="scte-value">${scteData.adCount} (${scteData.adCompletionRate}% complete)</span>
    </div>`;

    // Add estimated durations
    displayHtml += `<div class="scte-info">
        <span>Est. Ad Time:</span>
        <span class="scte-value">${scteData.adDuration.toFixed(1)}s</span>
    </div>`;

    // Add ad to content ratio if we have both
    if (scteData.adDuration > 0 && scteData.contentDuration > 0) {
        const ratio = scteData.adDuration / scteData.contentDuration;
        displayHtml += `<div class="scte-info">
            <span>Ad:Content Ratio:</span>
            <span class="scte-value">1:${(1 / ratio).toFixed(1)}</span>
        </div>`;
    }

    // Add the most recent markers (limited to last 3)
    displayHtml += `<div class="scte-info" style="margin-top: 5px;">
        <span>Recent Markers:</span>
        <div style="text-align: right;">`;

    const recentMarkers = scteData.markers.slice(-3);
    recentMarkers.forEach(marker => {
        const markerClass = marker.type === 'ad-start' ? 'ad-marker' :
            marker.type === 'ad-end' ? 'content-marker' : '';
        const label = marker.type === 'ad-start' ? 'AD-START' :
            marker.type === 'ad-end' ? 'AD-END' : 'MARKER';

        displayHtml += `<span class="scte-marker ${markerClass}">${label}</span>`;
    });

    displayHtml += `</div></div>`;

    // Add toggle for SCTE details
    displayHtml += `<div style="margin-top: 5px;">
        <a href="#" id="scteDetailToggle" class="scte-detail-toggle">Show SCTE-35 Details</a>
    </div>`;

    scteDisplay.innerHTML = displayHtml;

    // Re-add event listener for toggle
    const toggleLink = document.getElementById('scteDetailToggle');
    if (toggleLink) {
        toggleLink.addEventListener('click', function (e) {
            e.preventDefault();
            toggleScteDetails();
        });
    }

    // Also update the ad ratio graph
    updateAdRatioGraph();
}

// Function to open SCTE explainer popup
function openScteExplainer() {
    // Calculate center position for the popup
    const width = 650;
    const height = 600;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);

    // Open a new window
    const explainerWindow = window.open('explainer.html', 'scteExplainer',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);

    // Focus the new window
    if (explainerWindow) {
        explainerWindow.focus();

        // Listen for messages from the explainer window
        window.addEventListener('message', function (event) {
            // Verify origin for security
            if (event.origin !== window.location.origin) return;

            // Check if explainer is ready for data
            if (event.data && event.data.type === 'explainerReady' && event.data.explainerType === 'scte') {
                // Send SCTE data to the explainer
                explainerWindow.postMessage({
                    type: 'scteData',
                    scteData: scteData
                }, '*');
            }
        });
    } else {
        alert("Popup blocked. Please allow popups for this site.");
    }
}

function openCacheExplainer() {
    console.log("Opening Cache Explainer");

    // Calculate center position for the popup
    const width = 650;
    const height = 600;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);

    // Open a new window with a hash to indicate cache explainer
    const explainerWindow = window.open('explainer.html#cache', 'cacheExplainer',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);

    // Focus the new window
    if (explainerWindow) {
        explainerWindow.focus();

        // Add a more targeted event listener
        const messageHandler = function (event) {
            // Verify origin for security
            if (event.origin !== window.location.origin) return;

            console.log("Message received:", event.data);

            // Check if explainer is ready for data
            if (event.data && event.data.type === 'explainerReady' && event.data.explainerType === 'cache') {
                console.log("Explainer ready, sending cache data");

                // Prepare cache data to send with hardcoded values for testing
                const cacheData = {
                    hitRatio: window.cacheData?.total > 0 ?
                        ((window.cacheData.hits / window.cacheData.total) * 100).toFixed(1) : "0",
                    hits: window.cacheData?.hits || 0,
                    misses: window.cacheData?.misses || 0,
                    total: window.cacheData?.total || 0,
                    history: window.cacheData?.history || [],
                    cacheTTL: {
                        hasDirectives: true,
                        maxAge: 86400,
                        age: 364,
                        cacheControl: "max-age=86400, stale-while-revalidate=3600, stale-if-error=3600"
                    }
                };

                console.log("Sending cache data:", cacheData);

                // Send cache data to the explainer
                explainerWindow.postMessage({
                    type: 'cacheData',
                    cacheData: cacheData
                }, '*');

                // Remove this event listener after sending data
                window.removeEventListener('message', messageHandler);
            }
        };

        // Add the event listener
        window.addEventListener('message', messageHandler);
    } else {
        alert("Popup blocked. Please allow popups for this site.");
    }
}