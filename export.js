// export.js - Data export functionality for HLS MetaView

const exportModule = {
    // Export session data to JSON file
    // Add to export.js, in the exportToJSON function
    exportToJSON: function () {
        console.log("Starting export to JSON...");

        // Check if metadataBuffer is accessible
        console.log("metadataBuffer available:", !!window.metadataBuffer);
        if (window.metadataBuffer) {
            console.log("Current metadata entries:", window.metadataBuffer.entries.length);
        }

        // Collect data from various sources
        const data = this.collectExportData();
        console.log("Collected export data with metadata count:", data.metadata.length);

        // Convert to JSON
        const jsonData = JSON.stringify(data, null, 2);

        // Create and trigger download
        this.downloadJSON(jsonData, `hls-metaview-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`);

        return data;
    },
    
    // Update the collectExportData function in export.js
    collectExportData: function () {
        const exportData = {
            timestamp: new Date().toISOString(),
            url: document.getElementById("hlsUrl")?.value || "unknown",
            metadata: [],
            cacheMetrics: {},
            resolutions: this.captureResolutions(),
            streamInfo: this.captureStreamInfo()
        };

        // Get metadata from buffer - properly access the global metadata buffer
        if (window.metadataBuffer && Array.isArray(window.metadataBuffer.entries)) {
            // Make sure we're getting a copy of the array to avoid reference issues
            exportData.metadata = [...window.metadataBuffer.entries];
            console.log("Collected metadata entries:", exportData.metadata.length);
        } else {
            console.warn("Metadata buffer not found or invalid in window object");
        }

        // Get cache metrics if available
        if (window.cacheData) {
            exportData.cacheMetrics = {
                hits: window.cacheData.hits || 0,
                misses: window.cacheData.misses || 0,
                total: window.cacheData.total || 0,
                hitRatio: window.cacheData.total > 0 ?
                    ((window.cacheData.hits / window.cacheData.total) * 100).toFixed(2) : 0,
                history: [...(window.cacheData.history || [])] // Make a copy
            };
        }

        return exportData;
    },
    
    // Capture resolutions information
    captureResolutions: function() {
        const resolutions = [];
        const resolutionItems = document.querySelectorAll('.resolution-item');
        
        resolutionItems.forEach(item => {
            // Parse resolution item to extract structured data
            const text = item.textContent;
            const match = text.match(/Resolution: (\d+x\d+), Bandwidth: (\d+) kbps/);
            
            if (match) {
                resolutions.push({
                    resolution: match[1],
                    bandwidth: parseInt(match[2], 10),
                    text: text
                });
            } else {
                resolutions.push({ text: text });
            }
        });
        
        return resolutions;
    },
    
    // Capture additional stream information
    captureStreamInfo: function() {
        return {
            videoElement: {
                currentTime: document.getElementById("videoPlayer")?.currentTime || 0,
                duration: document.getElementById("videoPlayer")?.duration || 0,
                readyState: document.getElementById("videoPlayer")?.readyState || 0
            },
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString()
        };
    },
    
    // Create download for JSON data
    downloadJSON: function(jsonData, filename) {
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};

// Add export button when DOM is loaded
document.addEventListener("DOMContentLoaded", function() {
    const exportArea = document.querySelector('.export-area');
    if (exportArea) {
        // In export.js - Update the export button styling
        const exportButton = document.createElement('button');
        exportButton.id = 'exportDataButton';
        exportButton.textContent = 'Export';
        exportButton.style.padding = '8px 12px';
        exportButton.style.background = '#4CAF50'; // Green color (keep as is)
        exportButton.style.color = 'white';
        exportButton.style.border = 'none';
        exportButton.style.borderRadius = '4px';
        exportButton.style.cursor = 'pointer';
        exportButton.style.marginLeft = '5px';
        
        exportButton.addEventListener('click', function() {
            exportModule.exportToJSON();
        });
        
        exportArea.appendChild(exportButton);
    }
});

// Make export module available globally
window.exportModule = exportModule;