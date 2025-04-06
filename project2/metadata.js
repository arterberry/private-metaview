// Metadata buffer configuration
const metadataConfig = {
    maxEntries: 5000,           // Maximum number of entries to keep in memory
    uiUpdateInterval: 1000,     // Update UI every 1 second
    localStorageKey: 'hlsMetaViewData',
    localStorageEnabled: true,  // Enable local storage
    autoSave: true,             // Auto-save to local storage
    autoSaveInterval: 10000     // Save to local storage every 10 seconds
};

// Store headers for each segment
const segmentHeaders = new Map();

// Function to extract segment ID from log line
function extractSegmentId(logLine) {
    // Look for patterns like "Load: 84: 1234KB" or "Loading fragment: 84"
    const match = logLine.match(/(?:Load|Loading fragment):\s+(\d+)/i);
    return match ? match[1] : null;
}

// Function to parse and format response headers
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

// Function to display headers in the panel
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

// Function to store segment headers
window.storeSegmentHeaders = function(segmentId, headers) {
    if (segmentId && headers) {
        console.log("Storing headers for segment:", segmentId, headers);
        segmentHeaders.set(segmentId, headers);
        
        // Save to localStorage if needed
        if (metadataConfig.localStorageEnabled) {
            try {
                const storageKey = `segment_headers_${segmentId}`;
                localStorage.setItem(storageKey, JSON.stringify(headers));
            } catch (e) {
                console.error("Error saving headers to localStorage:", e);
            }
        }
    }
};

// Function to retrieve headers from localStorage
function loadHeadersFromStorage() {
    if (!metadataConfig.localStorageEnabled) return;
    
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('segment_headers_')) {
                const segmentId = key.replace('segment_headers_', '');
                const headers = JSON.parse(localStorage.getItem(key));
                segmentHeaders.set(segmentId, headers);
            }
        }
    } catch (e) {
        console.error("Error loading headers from localStorage:", e);
    }
}

// Metadata buffer
const metadataBuffer = {
    entries: [],
    lastUIUpdate: 0,
    lastSave: 0,
    
    // Add an entry to the buffer
    addEntry: function(text, isError = false, isHighlighted = false) {
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
    
    // Update the UI with current buffer contents
    updateUI: function() {
        const metadataList = document.getElementById("metadataList");
        if (!metadataList) return;
        
        // Clear existing entries
        metadataList.innerHTML = "";
        
        // Add entries from buffer (newest first)
        this.entries.forEach(entry => {
            const entryElement = createMetadataElement(entry);
            metadataList.appendChild(entryElement);
        });
    },
    
    // Save buffer to local storage
    saveToLocalStorage: function() {
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
    
    // Load buffer from local storage
    loadFromLocalStorage: function() {
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
    
    // Clear data function
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

        // Clear segment headers
        segmentHeaders.clear();
        
        // Clear headers from localStorage
        if (metadataConfig.localStorageEnabled) {
            try {
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const key = localStorage.key(i);
                    if (key.startsWith('segment_headers_')) {
                        localStorage.removeItem(key);
                    }
                }
            } catch (e) {
                console.error("Error clearing headers from localStorage:", e);
            }
        }
        
        // Reset header panel
        const headerContent = document.getElementById('headerContent');
        if (headerContent) {
            headerContent.textContent = "Select a segment to view headers";
        }

        // Force a UI refresh
        const metadataList = document.getElementById("metadataList");
        if (metadataList) {
            metadataList.innerHTML = "";
        }
    },
    
    // Export data as JSON
    exportAsJSON: function() {
        const exportData = {
            metadata: this.entries,
            cacheMetrics: window.cacheData || {},
            resolutions: this.captureResolutions(),
            timestamp: new Date().toISOString(),
            url: document.getElementById("hlsUrl")?.value || "unknown"
        };
        
        return JSON.stringify(exportData, null, 2);
    },
    
    // Capture current resolutions
    captureResolutions: function() {
        const resolutions = [];
        const resolutionItems = document.querySelectorAll('.resolution-item');
        
        resolutionItems.forEach(item => {
            resolutions.push(item.textContent);
        });
        
        return resolutions;
    }
};

// Corrected createMetadataElement function
function createMetadataElement(entry) {
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
    
    // Add hover effects and pointer cursor
    entryElement.style.cursor = "pointer";
    entryElement.addEventListener('mouseover', function() {
        this.style.backgroundColor = "#333"; // Darker background on hover
    });
    entryElement.addEventListener('mouseout', function() {
        if (!this.classList.contains('selected')) {
            this.style.backgroundColor = ""; // Reset background on mouseout if not selected
        }
    });
    
    // Extract segment ID and add click handler
    const segmentId = extractSegmentId(entry.text);
    if (segmentId) {
        // Store segment ID as data attribute
        entryElement.setAttribute('data-segment-id', segmentId);
        
        // Add click event handler
        entryElement.addEventListener('click', function() {
            // Remove selected class from all entries
            document.querySelectorAll('#metadataList div').forEach(el => {
                el.classList.remove('selected');
                el.style.backgroundColor = ""; // Reset any inline background color
            });
            
            // Add selected class to this entry
            this.classList.add('selected');
            this.style.backgroundColor = "#1a3c5f"; // Selected background color
            
            // Display headers for this segment
            displayHeaders(segmentId);
        });
    }
    
    return entryElement;
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function() {
    console.log("Initializing metadata buffer...");

    // Set up vertical resize handler
    const resizeHandleVertical = document.getElementById('resizeHandleVertical');
    const metadataPanel = document.getElementById('metadataPanel');
    const headerPanel = document.getElementById('headerPanel');
    
    if (resizeHandleVertical && metadataPanel && headerPanel) {
        let isResizing = false;
        let startX, startWidthMetadata, startWidthHeader;
        
        resizeHandleVertical.addEventListener('mousedown', function(e) {
            isResizing = true;
            startX = e.clientX;
            startWidthMetadata = metadataPanel.offsetWidth;
            startWidthHeader = headerPanel.offsetWidth;
            
            document.body.style.userSelect = 'none';
        });
        
        document.addEventListener('mousemove', function(e) {
            if (!isResizing) return;
            
            const deltaX = e.clientX - startX;
            const containerWidth = metadataPanel.parentElement.offsetWidth;
            
            let newWidthMetadata = startWidthMetadata + deltaX;
            let newWidthHeader = startWidthHeader - deltaX;
            
            // Ensure minimum widths
            if (newWidthMetadata < 200) {
                newWidthMetadata = 200;
                newWidthHeader = containerWidth - newWidthMetadata - resizeHandleVertical.offsetWidth;
            } else if (newWidthHeader < 200) {
                newWidthHeader = 200;
                newWidthMetadata = containerWidth - newWidthHeader - resizeHandleVertical.offsetWidth;
            }
            
            // Apply new widths as percentages
            metadataPanel.style.flex = `${newWidthMetadata}`;
            headerPanel.style.flex = `${newWidthHeader}`;
        });
        
        document.addEventListener('mouseup', function() {
            if (isResizing) {
                isResizing = false;
                document.body.style.userSelect = '';
            }
        });
    }

    // Load headers from storage
    loadHeadersFromStorage();

    // Clear the metadata UI first
    const metadataList = document.getElementById("metadataList");
    if (metadataList) {
        metadataList.innerHTML = "";
    }

    // Ensure buffer is empty on startup
    metadataBuffer.entries = [];
    console.log("Metadata buffer initialized with empty entries");

    // Confirm global exposure
    window.metadataBuffer = metadataBuffer;
    window.createMetadataElement = createMetadataElement;
    console.log("metadataBuffer exposed to window object:", !!window.metadataBuffer);
    
    // Add export button to the export area
    const exportArea = document.querySelector('.export-area');
    if (exportArea) {        
        // Add clear button next to export button
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
        
        clearButton.addEventListener('click', function() {
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
                    
                    // Update hit ratio display
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
});

// Export the addMetadataEntry function to be used as a global function
window.addMetadataEntry = function(text, isError = false, isHighlighted = false) {
    return metadataBuffer.addEntry(text, isError, isHighlighted);
};

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

// Export fetchMetadata function to global scope
window.fetchMetadata = fetchMetadata;