// Metadata buffer configuration
const metadataConfig = {
    maxEntries: 5000,           // Maximum number of entries to keep in memory
    uiUpdateInterval: 1000,     // Update UI every 1 second
    localStorageKey: 'hlsMetaViewData',
    localStorageEnabled: true,  // Enable local storage
    autoSave: true,             // Auto-save to local storage
    autoSaveInterval: 10000     // Save to local storage every 10 seconds
};

// Maps to store segment data
const segmentHeaders = new Map();
const segmentBodies = new Map();

// Add this function near the top of metadata.js (before it's used)
function extractFilenameFromUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.pathname.split('/').pop() || "unknown";
    } catch (e) {
        console.error("Error extracting filename:", e);
        return "unknown";
    }
}

// Make it globally available
window.extractFilenameFromUrl = extractFilenameFromUrl;

/**
 * Extracts segment ID from log line
 * @param {string} logLine - The log text to extract from
 * @returns {string|null} - Segment ID or null
 */
function extractSegmentId(logLine) {
    // Look for patterns like "Load: 84: 1234KB" or "Loading fragment: 84"
    const match = logLine.match(/(?:Load|Loading fragment):\s+(\d+)/i);
    return match ? match[1] : null;
}

/**
 * Extracts just filename from URL or path
 * @param {string} url - URL or path to extract from
 * @returns {string} - Extracted filename or original input
 */
function extractFilename(url) {
    try {
        const matches = url.match(/\/([^\/]+\.(?:ts|m3u8))[^\/]*$/i);
        if (matches && matches[1]) {
            return matches[1];
        }
        return url; // Return full URL if no match
    } catch (e) {
        console.error("Error extracting filename:", e);
        return url;
    }
}

/**
 * Parses and formats response headers
 * @param {object|string} headersText - Headers in JSON or string format
 * @returns {string} - Formatted JSON string
 */
function formatHeaders(headersText) {
    if (!headersText) return "No header data available";

    try {
        // Try to parse as JSON if it's already in that format
        const headerObj = typeof headersText === 'object' ?
            headersText : JSON.parse(headersText);

        return JSON.stringify(headerObj, null, 2);
    } catch (e) {
        // If not JSON, format as key-value pairs
        const lines = headersText.split('\n');
        const formatted = {};

        lines.forEach(line => {
            const parts = line.split(':');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join(':').trim();
                formatted[key] = value;
            }
        });

        return JSON.stringify(formatted, null, 2);
    }
}

/**
 * Processes metadata entries and filters unwanted entries
 * @param {string} text - Entry text
 * @param {boolean} isError - If entry is an error
 * @param {boolean} isHighlighted - If entry should be highlighted
 * @returns {object|null} - Processed entry object or null if filtered out
 */
function processMetadataEntry(text, isError = false, isHighlighted = false) {
    // Skip entries containing EXT-X tags
    if (text.includes('#EXT-X-') || text.includes('#EXTM3U')) {
        return null;
    }

    // Skip detailed loading information
    if (text.match(/Load: \d+: \d+KB in/)) {
        return null;
    }

    // Skip loading fragment lines
    if (text.includes('Loading fragment:')) {
        return null;
    }

    // Let other entries through unchanged (quality switches, manifest parsed, etc.)
    return {
        text: text,
        isError,
        isHighlighted
    };
}

/**
 * Creates a DOM element for a metadata entry
 * @param {object} entry - Metadata entry object
 * @returns {HTMLElement|null} - DOM element or null if entry is invalid
 */
function createMetadataElement(entry) {
    if (!entry) return null; // Skip null entries

    let entryElement = document.createElement("div");

    if (entry.text.includes('\n')) {
        entryElement.innerHTML = entry.text.replace(/\n/g, '<br>');
    } else {
        entryElement.textContent = entry.text;
    }

    entryElement.setAttribute('data-error', entry.isError);
    entryElement.setAttribute('data-highlighted', entry.isHighlighted);

    // Add timestamp
    let timeElement = document.createElement("span");
    timeElement.textContent = `[${entry.timestamp}] `;
    timeElement.style.color = "#888";
    timeElement.style.marginRight = "5px";

    entryElement.prepend(timeElement);

    // Add hover and selection styling
    entryElement.style.cursor = "pointer";
    entryElement.addEventListener('mouseover', function () {
        this.style.backgroundColor = "#333";
    });
    entryElement.addEventListener('mouseout', function () {
        if (!this.classList.contains('selected')) {
            this.style.backgroundColor = "";
        }
    });

    // Extract segment ID and add click handler
    const segmentId = extractSegmentId(entry.text);
    if (segmentId) {
        entryElement.setAttribute('data-segment-id', segmentId);
        entryElement.addEventListener('click', function () {
            // Remove selected class from all entries
            document.querySelectorAll('#metadataList div').forEach(el => {
                el.classList.remove('selected');
                el.style.backgroundColor = "";
            });

            // Add selected class to this entry
            this.classList.add('selected');
            this.style.backgroundColor = "#1a3c5f";

            // Display both headers and body for this segment
            displayHeaders(segmentId);
            displayResponseBody(segmentId);
        });
    }

    return entryElement;
}

/**
 * Displays headers in the panel
 * @param {string} segmentId - Segment ID
 */
function displayHeaders(segmentId) {
    const headerContent = document.getElementById('headerContent');
    if (!headerContent) return;

    if (segmentHeaders.has(segmentId)) {
        const headers = segmentHeaders.get(segmentId);
        headerContent.textContent = formatHeaders(headers);
    } else {
        headerContent.textContent = "No header data available for this segment";
    }
}

/**
 * Displays response body in the panel
 * @param {string} segmentId - Segment ID
 */
function displayResponseBody(segmentId) {
    const bodyContent = document.getElementById('bodyContent');
    if (!bodyContent) return;

    if (segmentBodies.has(segmentId)) {
        const body = segmentBodies.get(segmentId);
        bodyContent.textContent = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
    } else {
        bodyContent.textContent = "No response body available for this segment";
    }
}

/**
 * Fetches metadata from URL
 * @param {string} url - URL to fetch metadata from
 */
async function fetchMetadata(url) {
    try {
        let response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }
        let text = await response.text();

        // Add metadata to buffer instead of directly to DOM
        addMetadataEntry(`Manifest content from ${url}:`);

        text.split("\n").forEach(line => {
            if (line.startsWith("#")) {
                addMetadataEntry(line);
            }
        });
    } catch (error) {
        console.error("Error fetching metadata:", error);
        addMetadataEntry(`Error fetching manifest: ${error.message}`, true);
    }
}

/**
 * Loads headers from localStorage
 */
function loadHeadersFromStorage() {
    if (!metadataConfig.localStorageEnabled) return;

    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('segment_headers_')) {
                const segmentId = key.replace('segment_headers_', '');
                const headers = JSON.parse(localStorage.getItem(key));
                segmentHeaders.set(segmentId, headers);
            } else if (key.startsWith('segment_body_')) {
                const segmentId = key.replace('segment_body_', '');
                const body = localStorage.getItem(key);
                try {
                    // Try to parse as JSON first
                    segmentBodies.set(segmentId, JSON.parse(body));
                } catch {
                    // If not valid JSON, store as string
                    segmentBodies.set(segmentId, body);
                }
            }
        }
    } catch (e) {
        console.error("Error loading data from localStorage:", e);
    }
}

// Metadata buffer
const metadataBuffer = {
    entries: [],
    lastUIUpdate: 0,
    lastSave: 0,

    /**
     * Adds an entry to the buffer
     * @param {string} text - Entry text
     * @param {boolean} isError - If entry is an error
     * @param {boolean} isHighlighted - If entry should be highlighted
     * @returns {object} - Created entry object
     */
    addEntry: function (text, isError = false, isHighlighted = false) {
        // Create entry object
        const entry = {
            text: text,
            isError: isError,
            isHighlighted: isHighlighted,
            timestamp: new Date().toLocaleTimeString(),
            date: new Date().toISOString()
        };

        // Add to buffer
        this.entries.unshift(entry);

        // Trim buffer if it exceeds max size
        if (this.entries.length > metadataConfig.maxEntries) {
            this.entries = this.entries.slice(0, metadataConfig.maxEntries);
        }

        // Update UI if needed
        const now = Date.now();
        if (now - this.lastUIUpdate > metadataConfig.uiUpdateInterval) {
            this.updateUI();
            this.lastUIUpdate = now;
        }

        // Auto-save to local storage if enabled
        if (metadataConfig.autoSave && metadataConfig.localStorageEnabled &&
            now - this.lastSave > metadataConfig.autoSaveInterval) {
            this.saveToLocalStorage();
            this.lastSave = now;
        }

        return entry;
    },

    /**
     * Updates the UI with current buffer contents
     */
    updateUI: function () {
        const metadataList = document.getElementById("metadataList");
        if (!metadataList) return;

        // Clear existing entries
        metadataList.innerHTML = "";

        // Add entries from buffer (newest first)
        this.entries.forEach(entry => {
            const entryElement = createMetadataElement(entry);
            if (entryElement) {
                metadataList.appendChild(entryElement);
            }
        });
    },

    /**
     * Saves buffer to local storage
     */
    saveToLocalStorage: function () {
        if (!metadataConfig.localStorageEnabled) return;

        try {
            // Create a storage object with metadata and cache metrics
            const storageData = {
                metadata: this.entries,
                cacheMetrics: window.cacheData || {},
                timestamp: new Date().toISOString()
            };

            localStorage.setItem(metadataConfig.localStorageKey, JSON.stringify(storageData));
            console.log(`Saved ${this.entries.length} metadata entries to local storage`);
        } catch (error) {
            console.error("Error saving to local storage:", error);

            // If quota exceeded, try saving only the last 100 entries
            if (error.name === 'QuotaExceededError') {
                try {
                    const reducedData = {
                        metadata: this.entries.slice(0, 100),
                        cacheMetrics: window.cacheData || {},
                        timestamp: new Date().toISOString(),
                        note: "Reduced data due to storage limits"
                    };

                    localStorage.setItem(metadataConfig.localStorageKey, JSON.stringify(reducedData));
                    console.log("Saved reduced dataset to local storage");
                } catch (e) {
                    console.error("Failed to save reduced dataset:", e);
                }
            }
        }
    },

    /**
     * Loads buffer from local storage
     */
    loadFromLocalStorage: function () {
        if (!metadataConfig.localStorageEnabled) return;

        try {
            const data = localStorage.getItem(metadataConfig.localStorageKey);
            if (data) {
                const parsedData = JSON.parse(data);
                if (parsedData.metadata && Array.isArray(parsedData.metadata)) {
                    this.entries = parsedData.metadata;
                    console.log(`Loaded ${this.entries.length} metadata entries from local storage`);

                    // Optionally restore cache metrics
                    if (parsedData.cacheMetrics && window.cacheData) {
                        window.cacheData = parsedData.cacheMetrics;
                        // Redraw cache graph if it exists
                        if (typeof window.drawCacheGraph === 'function') {
                            window.drawCacheGraph();
                        }
                    }

                    this.updateUI();
                }
            }
        } catch (error) {
            console.error("Error loading from local storage:", error);
        }
    },

    /**
     * Clears all data
     */
    clear: function () {
        console.log("Clearing all metadata and cache metrics");
        this.entries = [];
        this.updateUI();

        if (metadataConfig.localStorageEnabled) {
            try {
                localStorage.removeItem(metadataConfig.localStorageKey);
                console.log("Cleared data from local storage");
            } catch (error) {
                console.error("Error clearing local storage:", error);
            }
        }

        // Clear segment data
        segmentHeaders.clear();
        segmentBodies.clear();

        // Clear from localStorage
        if (metadataConfig.localStorageEnabled) {
            try {
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const key = localStorage.key(i);
                    if (key.startsWith('segment_headers_') || key.startsWith('segment_body_')) {
                        localStorage.removeItem(key);
                    }
                }
            } catch (e) {
                console.error("Error clearing segment data from localStorage:", e);
            }
        }

        // Reset panels
        const headerContent = document.getElementById('headerContent');
        if (headerContent) {
            headerContent.textContent = "Select a segment to view headers";
        }

        const bodyContent = document.getElementById('bodyContent');
        if (bodyContent) {
            bodyContent.textContent = "Select a segment to view response body";
        }

        // Force a UI refresh
        const metadataList = document.getElementById("metadataList");
        if (metadataList) {
            metadataList.innerHTML = "";
        }
    },

    /**
     * Exports data as JSON
     * @returns {string} - JSON string
     */
    exportAsJSON: function () {
        const exportData = {
            metadata: this.entries,
            cacheMetrics: window.cacheData || {},
            resolutions: this.captureResolutions(),
            timestamp: new Date().toISOString(),
            url: document.getElementById("hlsUrl")?.value || "unknown"
        };

        return JSON.stringify(exportData, null, 2);
    },

    /**
     * Captures current resolutions
     * @returns {Array} - Array of resolution strings
     */
    captureResolutions: function () {
        const resolutions = [];
        const resolutionItems = document.querySelectorAll('.resolution-item');

        resolutionItems.forEach(item => {
            resolutions.push(item.textContent);
        });

        return resolutions;
    }
};

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
    console.log("Initializing metadata buffer...");

    // Set up vertical resize handler
    initializeResizeHandler();

    // Set up tab buttons
    initializeTabButtons();

    // Load data from storage
    loadHeadersFromStorage();

    // Clear the metadata UI first
    const metadataList = document.getElementById("metadataList");
    if (metadataList) {
        metadataList.innerHTML = "";
    }

    // Ensure buffer is empty on startup
    metadataBuffer.entries = [];
    console.log("Metadata buffer initialized with empty entries");

    // Add global functions for external use
    window.metadataBuffer = metadataBuffer;
    window.createMetadataElement = createMetadataElement;
    window.addMetadataEntry = function (text, isError = false, isHighlighted = false) {
        const processedEntry = processMetadataEntry(text, isError, isHighlighted);
        if (!processedEntry) return null; // Skip entries we don't want to show

        return metadataBuffer.addEntry(processedEntry.text, processedEntry.isError, processedEntry.isHighlighted);
    };
    // Replace the storeSegmentHeaders function in the window initialization
// Replace the storeSegmentHeaders function in metadata.js
window.storeSegmentHeaders = function (segmentId, headers) {
    if (!segmentId || !headers) return;

    console.log("Storing headers for segment:", segmentId, headers);

    // Ensure the global Map exists
    if (!window.segmentHeaders) {
        window.segmentHeaders = new Map();
    }

    // Store headers with string key
    window.segmentHeaders.set(String(segmentId), headers);

    // Save to localStorage if needed
    if (metadataConfig && metadataConfig.localStorageEnabled) {
        try {
            const storageKey = `segment_headers_${segmentId}`;
            localStorage.setItem(storageKey, JSON.stringify(headers));
        } catch (e) {
            console.error("Error saving headers to localStorage:", e);
        }
    }
};
    
    
    window.storeSegmentBody = function (segmentId, body) {
        if (!segmentId || !body) return;

        segmentBodies.set(segmentId, body);

        // Save to localStorage if needed
        if (metadataConfig.localStorageEnabled) {
            try {
                const storageKey = `segment_body_${segmentId}`;
                localStorage.setItem(storageKey, typeof body === 'string' ? body : JSON.stringify(body));
            } catch (e) {
                console.error("Error saving body to localStorage:", e);
            }
        }
    };

// Add this to the player.js file
window.debugSegmentHeaders = function() {
    console.log("Debugging segment headers");
    
    if (!window.segmentHeaders) {
        console.error("segmentHeaders map doesn't exist!");
        return;
    }
    
    console.log("Total entries in segmentHeaders:", window.segmentHeaders.size);
    console.log("Keys in segmentHeaders:", [...window.segmentHeaders.keys()]);
    
    // Log a sample of the first entry if available
    if (window.segmentHeaders.size > 0) {
        const firstKey = [...window.segmentHeaders.keys()][0];
        console.log("Sample entry:", firstKey, window.segmentHeaders.get(firstKey));
    }
    
    // Check if the headerContent element exists
    const headerContent = document.getElementById('headerContent');
    if (headerContent) {
        console.log("headerContent element exists");
        
        // Try to set some test content
        try {
            headerContent.textContent = "DEBUG TEST: " + new Date().toISOString();
            console.log("Successfully set test content on headerContent");
        } catch (e) {
            console.error("Error setting test content:", e);
        }
    } else {
        console.error("headerContent element not found!");
    }
};

    window.fetchMetadata = fetchMetadata;

    console.log("Global functions exposed to window object");

    // Add export/clear buttons to the export area
    setupExportButtons();

    // Explicitly expose the maps to window
    window.segmentHeaders = segmentHeaders;
    window.segmentBodies = segmentBodies;

    // Debug logging
    console.log("Initialized global Maps:",
        { headersCount: segmentHeaders.size, bodiesCount: segmentBodies.size });
});

/**
 * Initialize resize handler for panels
 */
function initializeResizeHandler() {
    const resizeHandle = document.getElementById('resizeHandleVertical');
    const metadataPanel = document.getElementById('metadataPanel');
    const responsePanel = document.getElementById('responsePanel');

    if (resizeHandle && metadataPanel && responsePanel) {
        let isResizing = false;
        let startX, startWidthMetadata;

        resizeHandle.addEventListener('mousedown', function (e) {
            isResizing = true;
            startX = e.clientX;
            startWidthMetadata = metadataPanel.offsetWidth;

            // Prevent text selection during resize
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'ew-resize';

            // Add a transparent overlay to catch mouse events
            const overlay = document.createElement('div');
            overlay.id = 'resizeOverlay';
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.zIndex = '9999';
            document.body.appendChild(overlay);
        });

        document.addEventListener('mousemove', function (e) {
            if (!isResizing) return;

            const deltaX = e.clientX - startX;
            const containerWidth = metadataPanel.parentElement.offsetWidth;

            // Calculate new width
            let newWidthMetadata = startWidthMetadata + deltaX;

            // Enforce min/max constraints
            const minWidth = 200;
            const maxWidth = containerWidth - 200 - resizeHandle.offsetWidth;

            if (newWidthMetadata < minWidth) newWidthMetadata = minWidth;
            if (newWidthMetadata > maxWidth) newWidthMetadata = maxWidth;

            // Set explicit width in pixels
            metadataPanel.style.width = newWidthMetadata + 'px';
            metadataPanel.style.flex = `0 0 ${newWidthMetadata}px`;
        });

        document.addEventListener('mouseup', function () {
            if (isResizing) {
                isResizing = false;
                document.body.style.userSelect = '';
                document.body.style.cursor = '';

                // Remove the overlay
                const overlay = document.getElementById('resizeOverlay');
                if (overlay) {
                    overlay.parentNode.removeChild(overlay);
                }
            }
        });
    }
}

/**
 * Initialize tab buttons
 */
function initializeTabButtons() {
    const tabButtons = document.querySelectorAll('.metadata_tab-button');

    tabButtons.forEach(button => {
        button.addEventListener('click', function () {
            // Remove active class from all buttons and panes
            document.querySelectorAll('.metadata_tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelectorAll('.metadata_tab-pane').forEach(pane => {
                pane.classList.remove('active');
            });

            // Add active class to clicked button
            this.classList.add('active');

            // Show corresponding tab pane
            const tabId = this.getAttribute('data-tab');
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
}

/**
 * Set up export and clear buttons
 */
function setupExportButtons() {
    const exportArea = document.querySelector('.export-area');
    if (exportArea) {
        // Add clear button
        const clearButton = document.createElement('button');
        clearButton.id = 'clearDataButton';
        clearButton.textContent = 'Clear';
        clearButton.style.padding = '8px 12px';
        clearButton.style.background = '#e74c3c'; // Red background
        clearButton.style.color = 'white';
        clearButton.style.border = 'none'; // Remove border
        clearButton.style.borderRadius = '4px';
        clearButton.style.cursor = 'pointer';
        clearButton.style.outline = 'none'; // Remove outline on focus

        clearButton.addEventListener('click', function () {
            if (confirm('Are you sure you want to clear all metadata and cache metrics?')) {
                metadataBuffer.clear();

                // Reset cache metrics if they exist
                if (window.cacheData) {
                    window.cacheData = {
                        hits: 0,
                        misses: 0,
                        total: 0,
                        history: [],
                        maxHistory: window.cacheData.maxHistory || 20
                    };

                    // Update UI elements
                    const hitRatioElement = document.getElementById('hitRatio');
                    if (hitRatioElement) {
                        hitRatioElement.textContent = 'Hit ratio: 0%';
                    }

                    const segmentCountElement = document.getElementById('segmentCount');
                    if (segmentCountElement) {
                        segmentCountElement.textContent = 'Segments: 0';
                    }

                    // Redraw cache graph
                    if (typeof window.drawCacheGraph === 'function') {
                        window.drawCacheGraph();
                    }
                }
            }
        });

        exportArea.appendChild(clearButton);
    }
}