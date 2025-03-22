// export.js - Data export functionality for HLS MetaView

const exportModule = {

    captureScreen: function() {
        console.log("Starting screen capture...");
        
        // Get the video container element
        const videoContainer = document.querySelector('.video-container');
        if (!videoContainer) {
            console.error("Video container not found");
            return Promise.reject("Video container not found");
        }
        
        // Use html2canvas to capture the video container
        return html2canvas(videoContainer, {
            logging: false,
            useCORS: true,
            allowTaint: true,
            backgroundColor: "#000000"
        }).then(canvas => {
            console.log("Screen capture successful");
            return canvas.toDataURL('image/png'); // Use PNG for better quality
        }).catch(error => {
            console.error("Screen capture failed:", error);
            return Promise.reject(error);
        });
    },

    // Export both data and screen capture
    exportWithScreenCapture: function () {
        console.log("Starting export with screen capture...");

        // First capture the screen
        this.captureScreen().then(screenshotData => {
            // Generate timestamp (same format for both files)
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            
            // Save the screenshot as a separate file
            const screenshotFilename = `metaview_screenshot_${timestamp}.png`;
            this.saveScreenshot(screenshotData, screenshotFilename);

            // Add a short delay before downloading the JSON
            setTimeout(() => {
                // Convert to JSON
                const jsonData = JSON.stringify(data, null, 2);
                // Create and trigger download
                this.downloadJSON(jsonData, `hls-metaview-export-${timestamp}.json`);
            }, 1000); // 1000ms delay

            // Collect data from various sources
            const data = this.collectExportData();

            // Add both screenshot reference and the actual base64 data
            data.screenshot = {
                filename: screenshotFilename,
                captureTime: timestamp,
                imageData: screenshotData // Include the base64 data in the JSON
            };
            console.log("Screenshot added to export data and saved as file:", screenshotFilename);

            // Convert to JSON
            const jsonData = JSON.stringify(data, null, 2);

            // Create and trigger download
            this.downloadJSON(jsonData, `hls-metaview-export-${timestamp}.json`);
        }).catch(error => {
            console.error("Screen capture failed, exporting without screenshot:", error);
            // Fall back to regular export
            this.exportToJSON();
        });
    },

    // Export session data to JSON file
    // Add to export.js, in the exportToJSON function
    exportToJSON: function () {
        console.log("Starting export to JSON...");
    
        // Check if metadataBuffer is accessible
        console.log("metadataBuffer available:", !!window.metadataBuffer);
        if (window.metadataBuffer) {
            console.log("Current metadata entries:", window.metadataBuffer.entries.length);
        }
    
        // First, try to capture the screen
        this.captureScreen().then(screenshotData => {
            // Generate timestamp (same format for both files)
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            
            // Save the screenshot as a separate file
            const screenshotFilename = `metaview_screenshot_${timestamp}.png`;
            this.saveScreenshot(screenshotData, screenshotFilename);
            
            // Collect data for JSON
            const data = this.collectExportData();
            
            // Add both screenshot reference and the actual base64 data
            data.screenshot = {
                filename: screenshotFilename,
                captureTime: timestamp,
                imageData: screenshotData // Include the base64 data in the JSON
            };
            
            // Save JSON with both reference and image data
            const jsonData = JSON.stringify(data, null, 2);
            this.downloadJSON(jsonData, `hls-metaview-export-${timestamp}.json`);
            
        }).catch(error => {
            // If screen capture fails, just export the JSON without it
            console.error("Screen capture failed, exporting without screenshot:", error);
            
            // Collect data from various sources
            const data = this.collectExportData();
            
            // Convert to JSON
            const jsonData = JSON.stringify(data, null, 2);
            
            // Create and trigger download
            this.downloadJSON(jsonData, `hls-metaview-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`);
        });
    
        return true;
    },

    // Add function to save screenshot data
    saveScreenshot: function (screenshotData, filename) {
        // Create a download link
        const link = document.createElement('a');
        link.href = screenshotData;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        console.log(`Screenshot saved as ${filename}`);
    },    
    
    // Update the collectExportData function in export.js
    collectExportData: function () {
        const exportData = {
            timestamp: new Date().toISOString(),
            url: document.getElementById("hlsUrl")?.value || "unknown",
            metadata: [],
            cacheMetrics: {},
            cacheTTL: window.latestTTLInfo || { hasDirectives: false },
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
// Add export button when DOM is loaded
document.addEventListener("DOMContentLoaded", function() {
    const exportArea = document.querySelector('.export-area');
    if (exportArea) {
        // In export.js - Update the export button styling
        const exportButton = document.createElement('button');
        exportButton.id = 'exportDataButton';
        exportButton.textContent = 'Export Data + Screen Capture';
        exportButton.style.padding = '8px 12px';
        exportButton.style.background = '#4CAF50'; // Green color (keep as is)
        exportButton.style.color = 'white';
        exportButton.style.border = 'none';
        exportButton.style.borderRadius = '4px';
        exportButton.style.cursor = 'pointer';
        exportButton.style.marginLeft = '5px';
        
        exportButton.addEventListener('click', function() {
            // Change button state to indicate processing
            const originalText = exportButton.textContent;
            exportButton.textContent = 'Capturing...';
            exportButton.disabled = true;
            
            // Use the new export with screen capture function
            exportModule.exportWithScreenCapture();
            
            // Reset button after a short delay
            setTimeout(() => {
                exportButton.textContent = originalText;
                exportButton.disabled = false;
            }, 2000);
        });
        
        exportArea.appendChild(exportButton);
    }
});

// Make export module available globally
window.exportModule = exportModule;