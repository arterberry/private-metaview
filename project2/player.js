console.log("HLS Player Page Script Loaded.");

document.addEventListener('DOMContentLoaded', () => {
    // ---- DOM Elements ----
    const videoElement = document.getElementById('hlsVideoPlayer');
    const resizeHandle = document.getElementById('resizeHandle');
    const videoContainer = document.querySelector('.video-container');
    const metadataSection = document.querySelector('.metadata-section');
    const mainContainer = document.querySelector('.main-container');
    const statusBar = document.getElementById('statusBar');
    const sidePanelButton = document.getElementById('side-panel-button');
    const clearButton = document.getElementById('clearDataButton');

    // ---- URL Parameters ----
    const urlParams = new URLSearchParams(window.location.search);
    const m3u8Src = urlParams.get('src'); // Get the original M3U8 URL

    // ---- Status Bar Functionality ----
    function updateStatusBar(text) {
        if (statusBar) {
            statusBar.textContent = text;
        }
    }

    // Expose function for external components
    window.updatePlayerStatus = updateStatusBar;

    // Initialize with basic info
    updateStatusBar('Ready');

    // ---- Resize Functionality ----
    if (resizeHandle) {
        let isResizing = false;
        let startY, startHeightVideo, startHeightMetadata;

        resizeHandle.addEventListener('mousedown', function (e) {
            isResizing = true;
            startY = e.clientY;
            startHeightVideo = videoContainer.offsetHeight;
            startHeightMetadata = metadataSection.offsetHeight;

            // Prevent text selection during resize
            document.body.style.userSelect = 'none';
            updateStatusBar('Resizing metadata panel...');
        });

        document.addEventListener('mousemove', function (e) {
            if (!isResizing) return;

            // Calculate how much to resize
            const deltaY = startY - e.clientY;
            const totalHeight = mainContainer.offsetHeight;

            // Adjust heights with minimum constraints
            let newVideoHeight = Math.max(200, startHeightVideo - deltaY);
            let newMetadataHeight = totalHeight - newVideoHeight;

            if (newMetadataHeight < 100) {
                newMetadataHeight = 100;
                newVideoHeight = totalHeight - newMetadataHeight;
            }

            // Apply new heights as percentages
            videoContainer.style.height = (newVideoHeight / totalHeight * 100) + '%';
            metadataSection.style.height = (newMetadataHeight / totalHeight * 100) + '%';
        });

        document.addEventListener('mouseup', function () {
            if (isResizing) {
                isResizing = false;
                document.body.style.userSelect = '';
                updateStatusBar('Ready');
            }
        });
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
                        // Access the headers
                        if (xhr && xhr.getAllResponseHeaders) {
                            console.log('Raw header string:', xhr.getAllResponseHeaders());
                            const headerString = xhr.getAllResponseHeaders();
                            const headers = {};

                            // Parse the header string
                            headerString.split('\r\n').forEach(line => {
                                if (line) {
                                    const parts = line.split(': ');
                                    const key = parts.shift();
                                    const value = parts.join(': ');
                                    if (key) headers[key] = value;
                                }
                            });

                            console.log('Segment response headers:', headers);

                            // Add status and URL information
                            headers['status'] = xhr.status;
                            headers['statusText'] = xhr.statusText;
                            headers['responseURL'] = xhr.responseURL || context.url;

                            // Extract segment ID from URL
                            const segmentId = extractSegmentIdFromUrl(context.url);
                            if (segmentId && window.storeSegmentHeaders) {
                                console.log("Storing headers for segment:", segmentId, headers);
                                window.storeSegmentHeaders(segmentId, headers);
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

    // Helper function to extract segment ID from URL
    function extractSegmentIdFromUrl(url) {
        // First try to match a segment number directly in the file name
        // This looks for patterns like segment-123.ts, media-123.ts, or seq-123.ts
        let match = url.match(/(?:segment|media|seq|chunk)-?(\d+)\./i);
        if (match && match[1]) {
            return match[1];
        }

        // Try to find a number followed by .ts
        match = url.match(/(\d+)\.ts/i);
        if (match && match[1]) {
            return match[1];
        }

        // If we can't extract an ID, try to get a segment number from any entries in the metadata buffer
        // This is a fallback approach that relies on timing
        if (window.metadataBuffer && window.metadataBuffer.entries.length > 0) {
            for (let i = 0; i < Math.min(10, window.metadataBuffer.entries.length); i++) {
                const entry = window.metadataBuffer.entries[i];
                if (entry.text.includes('Loading fragment:') || entry.text.includes('Load:')) {
                    const segIdMatch = entry.text.match(/(?:fragment|Load):\s+(\d+)/i);
                    if (segIdMatch && segIdMatch[1]) {
                        return segIdMatch[1];
                    }
                }
            }
        }

        // If we still can't find a segment ID, generate one based on the current timestamp
        // This isn't ideal but provides a unique identifier
        return 'unknown-' + Date.now();
    }

    // ---- Side Panel Button ----
    if (sidePanelButton) {
        sidePanelButton.addEventListener('click', async () => {
            console.log('Side panel button clicked');
            try {
                const currentWindow = await chrome.windows.getCurrent();
                if (currentWindow) {
                    await chrome.sidePanel.open({ windowId: currentWindow.id });
                    console.log('Side panel opened');
                } else {
                    console.error('Could not get current window');
                }
            } catch (error) {
                console.error('Error opening side panel:', error);
            }
        });
    } else {
        console.error('Side panel button not found');
    }

    // ---- Clear Button Functionality ----
    if (clearButton && window.metadataBuffer) {
        clearButton.addEventListener('click', function () {
            if (confirm('Are you sure you want to clear all metadata?')) {
                window.metadataBuffer.clear();
            }
        });
    }

    // ---- Video Player Initialization ----
    if (!videoElement) {
        console.error("Video element not found!");
        return;
    }

    if (!m3u8Src) {
        console.error("M3U8 source URL not found in query parameters!");
        document.body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Error: M3U8 source URL missing.</p>';
        return;
    }

    console.log(`Attempting to play HLS stream: ${m3u8Src}`);

    // Add metadata entry showing the stream URL
    if (window.addMetadataEntry) {
        addMetadataEntry(`Loading stream: ${decodeURIComponent(m3u8Src)}`, false, true);
    }

    // ---- HLS Player Setup ----
    function initializeHlsPlayer() {
        if (Hls.isSupported()) {
            console.log("HLS.js is supported. Initializing...");
            const hls = new Hls({
                debug: false, // Set to true for verbose HLS debugging in console
                loader: createCustomLoader(Hls) // Use the custom loader for header capture
            });

            // Load the source URL
            hls.loadSource(decodeURIComponent(m3u8Src));

            // Bind video element
            hls.attachMedia(videoElement);

            // Set up HLS event listeners
            setupHlsEventListeners(hls);

        } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
            // Fallback for browsers with native HLS support
            console.log("HLS.js not supported, but native HLS playback might work.");

            if (window.addMetadataEntry) {
                addMetadataEntry("HLS.js not supported, using native HLS playback", false, true);
            }

            videoElement.src = decodeURIComponent(m3u8Src);
            videoElement.addEventListener('loadedmetadata', function () {
                videoElement.play().catch(e => console.warn("Autoplay failed:", e));
                if (window.addMetadataEntry) {
                    addMetadataEntry("Video metadata loaded, playback started");
                }
            });

            chrome.runtime.sendMessage({
                type: "NATIVE_HLS_PLAYBACK",
                payload: { url: decodeURIComponent(m3u8Src) }
            }).catch(e => console.warn("Failed to send native playback info to side panel:", e));

        } else {
            // No HLS support at all
            console.error("HLS is not supported in this browser.");

            if (window.addMetadataEntry) {
                addMetadataEntry("HLS is not supported in this browser", true, true);
            }

            document.body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Error: HLS playback is not supported in your browser.</p>';

            chrome.runtime.sendMessage({
                type: "HLS_NOT_SUPPORTED",
                payload: { url: decodeURIComponent(m3u8Src) }
            }).catch(e => console.warn("Failed to send HLS not supported info to side panel:", e));
        }
    }

    // ---- HLS Event Listeners ----
    function setupHlsEventListeners(hls) {
        // Manifest parsed event
        hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
            console.log("Manifest parsed, levels available:", data.levels);
            videoElement.play().catch(e => console.warn("Autoplay failed:", e));

            // Update status bar with quality info
            if (window.updatePlayerStatus) {
                const qualities = data.levels.map(l => `${l.height}p`).join(', ');
                window.updatePlayerStatus(`Available qualities: ${qualities}`);
            }

            // Log to metadata panel
            if (window.addMetadataEntry) {
                addMetadataEntry(`Manifest parsed: ${data.levels.length} quality levels available`, false, true);
                data.levels.forEach(level => {
                    const bitrate = level.bitrate ? `${Math.round(level.bitrate / 1000)} kbps` : 'Unknown';
                    const resolution = level.width && level.height ? `${level.width}x${level.height}` : 'Unknown';
                    addMetadataEntry(`Quality level: ${resolution} @ ${bitrate}`);
                });
            }

            // Try to fetch and display the manifest content
            if (window.fetchMetadata) {
                fetchMetadata(decodeURIComponent(m3u8Src));
            }

            // Send data to side panel
            chrome.runtime.sendMessage({
                type: "HLS_MANIFEST_DATA",
                payload: {
                    url: decodeURIComponent(m3u8Src),
                    levels: data.levels.map(l => ({ height: l.height, bitrate: l.bitrate })),
                }
            }).catch(e => console.warn("Failed to send manifest data to side panel:", e));
        });

        // Level switched event
        hls.on(Hls.Events.LEVEL_SWITCHED, function (event, data) {
            const currentLevel = hls.levels[data.level];
            console.log('Switched to level:', currentLevel);

            // Update status bar
            if (window.updatePlayerStatus && hls.levels && hls.levels[data.level]) {
                window.updatePlayerStatus(`Playing: ${currentLevel.height}p @ ${Math.round(currentLevel.bitrate / 1000)} kbps`);
            }

            // Log to metadata panel
            if (window.addMetadataEntry) {
                const resolution = currentLevel.width && currentLevel.height ? `${currentLevel.width}x${currentLevel.height}` : 'Unknown';
                const bitrate = currentLevel.bitrate ? `${Math.round(currentLevel.bitrate / 1000)} kbps` : 'Unknown';
                addMetadataEntry(`Quality switched to: ${resolution} @ ${bitrate}`);
            }

            // Send data to side panel
            chrome.runtime.sendMessage({
                type: "HLS_LEVEL_SWITCH",
                payload: {
                    height: currentLevel.height,
                    bitrate: currentLevel.bitrate
                }
            }).catch(e => console.warn("Failed to send level switch data to side panel:", e));
        });

        // Update these event handlers in the setupHlsEventListeners function in player.js
        // Fragment loading event
        hls.on(Hls.Events.FRAG_LOADING, function (event, data) {
            if (window.addMetadataEntry) {
                // Extract the segment name from the URL
                let segmentName = "unknown";
                try {
                    const url = new URL(data.frag.url);
                    segmentName = url.pathname.split('/').pop(); // Get the last part of the path
                } catch (e) {
                    console.error("Error extracting segment name:", e);
                }
                addMetadataEntry(`Loading fragment: ${data.frag.sn} - ${segmentName}`);
            }

            // Attach a progress listener to the XHR to capture headers when loaded
            try {
                if (data.frag.loader && data.frag.loader.xhr) {
                    const xhr = data.frag.loader.xhr;
                    xhr.addEventListener('load', function () {
                        if (xhr.readyState === 4 && xhr.status >= 200 && xhr.status < 300) {
                            // Create headers object
                            const headers = {
                                "status": xhr.status,
                                "statusText": xhr.statusText,
                                "responseURL": xhr.responseURL || data.frag.url
                            };

                            // Get all headers
                            try {
                                const headersText = xhr.getAllResponseHeaders();
                                console.log("Headers text:", headersText);

                                if (headersText) {
                                    const headerLines = headersText.split('\r\n');
                                    headerLines.forEach(line => {
                                        if (line) {
                                            const parts = line.split(':');
                                            if (parts.length >= 2) {
                                                const key = parts[0].trim();
                                                const value = parts.slice(1).join(':').trim();
                                                headers[key] = value;
                                            }
                                        }
                                    });
                                }
                            } catch (e) {
                                console.error("Error parsing headers:", e);
                            }

                            // Store headers with segment ID
                            if (window.storeSegmentHeaders) {
                                console.log("Storing headers for segment:", data.frag.sn, headers);
                                window.storeSegmentHeaders(data.frag.sn, headers);
                            }
                        }
                    });
                }
            } catch (e) {
                console.error("Error setting up XHR listener:", e);
            }
        });

        // Fragment loaded event
        hls.on(Hls.Events.FRAG_LOADED, function (event, data) {
            if (window.addMetadataEntry) {
                const loadTime = data.stats.tload - data.stats.trequest;
                const size = Math.round(data.stats.total / 1024);

                // Extract the segment name from the URL
                let segmentName = "unknown";
                try {
                    const url = new URL(data.frag.url);
                    segmentName = url.pathname.split('/').pop(); // Get the last part of the path
                } catch (e) {
                    console.error("Error extracting segment name:", e);
                }

                // Format according to requirements: "Load: ###: 1099KB in 1292.7000000029802ms: the_segment_name.ts"
                addMetadataEntry(`Load: ${data.frag.sn}: ${size}KB in ${loadTime}ms: ${segmentName}`);

                // Alternative method to capture headers in case the event listener approach doesn't work
                try {
                    if (data.frag.loader && data.frag.loader.xhr) {
                        const xhr = data.frag.loader.xhr;
                        const headers = {
                            "status": xhr.status,
                            "statusText": xhr.statusText,
                            "responseURL": xhr.responseURL || data.frag.url,
                            "content-type": xhr.getResponseHeader("content-type") || "unknown",
                            "content-length": xhr.getResponseHeader("content-length") || size.toString(),
                            "date": xhr.getResponseHeader("date") || new Date().toUTCString(),
                            "last-modified": xhr.getResponseHeader("last-modified") || "unknown",
                            "cache-control": xhr.getResponseHeader("cache-control") || "unknown",
                            "server": xhr.getResponseHeader("server") || "unknown",
                            "etag": xhr.getResponseHeader("etag") || "unknown"
                        };

                        // Try to get all headers
                        try {
                            const headersText = xhr.getAllResponseHeaders();
                            if (headersText) {
                                const headerLines = headersText.split('\r\n');
                                headerLines.forEach(line => {
                                    if (line) {
                                        const colonIndex = line.indexOf(':');
                                        if (colonIndex > 0) {
                                            const key = line.substring(0, colonIndex).trim();
                                            const value = line.substring(colonIndex + 1).trim();
                                            headers[key] = value;
                                        }
                                    }
                                });
                            }
                        } catch (e) {
                            console.error("Error parsing all headers:", e);
                        }

                        // Store headers with segment ID
                        if (window.storeSegmentHeaders) {
                            console.log("Storing headers for segment (method 2):", data.frag.sn, headers);
                            window.storeSegmentHeaders(data.frag.sn, headers);
                        }
                    }
                } catch (e) {
                    console.error("Error capturing headers in FRAG_LOADED event:", e);

                    // Fallback to stats data if headers can't be captured
                    const statsHeaders = {
                        "NOTE": "Response headers not available - showing statistics instead",
                        "Load Time (ms)": loadTime,
                        "Size (KB)": size,
                        "URL": data.frag.url,
                        "Segment Number": data.frag.sn,
                        "First Byte Time (ms)": data.stats.tfirst - data.stats.trequest,
                        "Request Time": new Date(data.stats.trequest).toISOString()
                    };

                    if (window.storeSegmentHeaders) {
                        console.log("Storing fallback stats for segment:", data.frag.sn, statsHeaders);
                        window.storeSegmentHeaders(data.frag.sn, statsHeaders);
                    }
                }
            }
        });

        // Error event
        hls.on(Hls.Events.ERROR, function (event, data) {
            console.error('HLS Error:', data);

            // Update status bar
            if (window.updatePlayerStatus) {
                window.updatePlayerStatus(`Error: ${data.details}`);
            }

            // Log to metadata panel
            if (window.addMetadataEntry) {
                let errorMsg = `Error: Type=${data.type}, Details=${data.details}`;
                if (data.url) {
                    errorMsg += `, URL=${data.url}`;
                }
                addMetadataEntry(errorMsg, true);
            }

            // Send data to side panel
            chrome.runtime.sendMessage({
                type: "HLS_ERROR",
                payload: {
                    type: data.type,
                    details: data.details,
                    fatal: data.fatal,
                    url: data.url
                }
            }).catch(e => console.warn("Failed to send error data to side panel:", e));

            // Handle fatal errors
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.error('Fatal network error encountered, trying to recover...');
                        if (window.addMetadataEntry) {
                            addMetadataEntry('Fatal network error encountered, trying to recover...', true);
                        }
                        hls.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.error('Fatal media error encountered, trying to recover...');
                        if (window.addMetadataEntry) {
                            addMetadataEntry('Fatal media error encountered, trying to recover...', true);
                        }
                        hls.recoverMediaError();
                        break;
                    default:
                        // Cannot recover
                        console.error('Unrecoverable fatal HLS error.');
                        if (window.addMetadataEntry) {
                            addMetadataEntry('Unrecoverable fatal HLS error.', true);
                        }
                        hls.destroy();
                        break;
                }
            }
        });
    }

    // Initialize the HLS player
    initializeHlsPlayer();
});