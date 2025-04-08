// Metadata buffer configuration
const metadataConfig = {
    maxEntries: 5000,           // Maximum number of entries to keep in memory
    uiUpdateInterval: 1000,     // Update UI every 1 second
    localStorageKey: 'hlsMetaViewData',
    localStorageEnabled: true,  // Enable local storage
    autoSave: true,             // Auto-save to local storage
    autoSaveInterval: 10000     // Save to local storage every 10 seconds
};

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
            let entryElement = document.createElement("div");
            
            // Use innerHTML for formatting if needed
            if (entry.text.includes('\n')) {
                entryElement.innerHTML = entry.text.replace(/\n/g, '<br>');
            } else {
                entryElement.textContent = entry.text;
            }
            
            if (entry.isError) {
                entryElement.style.color = "red";
                entryElement.style.fontWeight = "bold";
            }
            
            if (entry.isHighlighted) {
                entryElement.style.backgroundColor = "#fffbcd"; // Light yellow highlight
                entryElement.style.padding = "5px";
                entryElement.style.border = "1px solid #ffeb3b";
            }
            
            // Add timestamp
            let timeElement = document.createElement("span");
            timeElement.textContent = `[${entry.timestamp}] `;
            timeElement.style.color = "#888";
            
            entryElement.prepend(timeElement);
            
            metadataList.appendChild(entryElement);
            
            // Add a separator
            let separator = document.createElement("hr");
            metadataList.appendChild(separator);
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
    
    // Update the clear function in metadata.js
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

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function() {
    console.log("Initializing metadata buffer...");

    // Clear the metadata UI first
    const metadataList = document.getElementById("metadataList");
    if (metadataList) {
        metadataList.innerHTML = "";
    }
    // Load previous session data if available
    // metadataBuffer.loadFromLocalStorage();
    // console.log(`Metadata buffer initialized with ${metadataBuffer.entries.length} entries`);

    // Instead, ensure buffer is empty on startup
    metadataBuffer.entries = [];
    console.log("Metadata buffer initialized with empty entries");

    // Confirm global exposure
    window.metadataBuffer = metadataBuffer;
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
        // clearButton.style.marginRight = '10px';
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
        // exportArea.appendChild(exportButton);
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
