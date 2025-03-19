document.addEventListener("DOMContentLoaded", function () {
    
    const closeButton = document.getElementById("closeButton");
    if (closeButton) {
        closeButton.addEventListener("click", function () {
            window.close();
        });
    } else {
        console.error("Close button not found");
    }

    const playButton = document.getElementById("playVideo");
    if (playButton) {
        playButton.addEventListener("click", handlePlayVideo);
    } else {
        console.error("Play button not found");
    }

    const helperLink = document.getElementById("playbackHelper");
    if (helperLink) {
        helperLink.addEventListener("click", function(e) {
            e.preventDefault();
            openHelperPopup();
        });
    } else {
        console.error("Playback helper link not found");
    }

    // Setup Admin button event listener (placeholder for now)
    const adminButton = document.getElementById('adminButton');
    if (adminButton) {
        adminButton.addEventListener('click', function () {
            console.log('Admin button clicked');
            // Functionality will be added later
        });
    } else {
        console.error("Admin button not found");
    }    

    // New code: Tab system handling
    setupTabSystem();

    // Initialize cache graph
    initCacheGraph();
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
        hls.on(Hls.Events.MANIFEST_LOADING, function(event, data) {
            console.log("Manifest loading:", data.url);
            addMetadataEntry(`Loading manifest: ${data.url}`);
        });
        
        hls.on(Hls.Events.MANIFEST_LOADED, function(event, data) {
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
                Level ${index}: ${level.width}x${level.height} @ ${Math.round(level.bitrate/1000)}kbps
                `;
            });
            
            addMetadataEntry(manifestInfo);
            
            // Fetch the raw manifest content to look for SCTE markers
            fetchAndParseManifest(data.url);
        });
        
        hls.on(Hls.Events.LEVEL_LOADING, function(event, data) {
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
        
        // Parse manifest content
        const text = await response.text();
        
        // Look for SCTE markers and other important tags
        const scteLines = [];
        const otherMetadata = [];
        
        text.split('\n').forEach(line => {
            // Check for SCTE-35 related tags
            if (line.includes('SCTE') || 
                line.includes('CUE-OUT') || 
                line.includes('CUE-IN') || 
                line.includes('DATERANGE') ||
                line.includes('MARKER')) {
                scteLines.push(line);
            }
            // Capture other metadata tags
            else if (line.startsWith('#EXT') && 
                    !line.startsWith('#EXTINF') && 
                    !line.startsWith('#EXT-X-BYTERANGE')) {
                otherMetadata.push(line);
            }
        });
        
        // Display SCTE markers if found
        if (scteLines.length > 0) {
            let scteInfo = `SCTE markers in ${url.split('/').pop()}:\n`;
            scteLines.forEach(line => {
                scteInfo += `${line}\n`;
            });
            addMetadataEntry(scteInfo, false, true); // Highlight SCTE info
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
function setupTabSystem() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
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
            }
        });
    });
    
    // Placeholder button event listener
    // const placeholderButton = document.getElementById('placeholderButton');
    // if (placeholderButton) {
    //     placeholderButton.addEventListener('click', function() {
    //         console.log('Placeholder button clicked');
    //         // You can add functionality here later
    //     });
    // } else {
    //     console.error("Placeholder button not found");
    // }
}