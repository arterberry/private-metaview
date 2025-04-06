console.log("Side panel script loaded.");

const urlDisplay = document.getElementById('m3u8Url');
const statusDisplay = document.getElementById('hlsStatus');
const levelsDisplay = document.getElementById('hlsLevels');
const currentLevelDisplay = document.getElementById('hlsCurrentLevel');
const errorsDisplay = document.getElementById('errors');

// Fetch any stored messages when the panel opens
function fetchStoredMessages() {
    chrome.storage.local.get(null, function(items) {
        console.log("Retrieved stored messages:", items);
        
        // Process any stored messages that start with 'latest_'
        for (const key in items) {
            if (key.startsWith('latest_')) {
                const message = items[key];
                console.log("Processing stored message:", message);
                processMessage(message);
            }
        }
    });
}

// Process incoming messages
function processMessage(message) {
    console.log("Processing message in side panel:", message);
    
    try {
        switch (message.type) {
            case "HLS_MANIFEST_DATA":
                statusDisplay.textContent = "Playing";
                if (message.payload.levels && message.payload.levels.length > 0) {
                    levelsDisplay.textContent = message.payload.levels.map(l => `${l.height}p`).join(', ');
                } else {
                    levelsDisplay.textContent = "Single level";
                }
                currentLevelDisplay.textContent = "Initial";
                errorsDisplay.innerHTML = '';
                
                // Update URL display if we have it
                if (message.payload.url) {
                    urlDisplay.textContent = message.payload.url;
                }
                break;

            case "HLS_LEVEL_SWITCH":
                if (message.payload.height && message.payload.bitrate) {
                    currentLevelDisplay.textContent = `${message.payload.height}p @ ${(message.payload.bitrate / 1000).toFixed(0)}kbps`;
                }
                break;

            case "NATIVE_HLS_PLAYBACK":
                statusDisplay.textContent = "Playing (Native)";
                levelsDisplay.textContent = "N/A (Native)";
                currentLevelDisplay.textContent = "N/A (Native)";
                
                // Update URL display if we have it
                if (message.payload.url) {
                    urlDisplay.textContent = message.payload.url;
                }
                break;

            case "HLS_NOT_SUPPORTED":
                statusDisplay.textContent = "Error";
                errorsDisplay.innerHTML = `<p>HLS Not Supported by browser.</p>`;
                
                // Update URL display if we have it
                if (message.payload.url) {
                    urlDisplay.textContent = message.payload.url;
                }
                break;

            case "HLS_ERROR":
                statusDisplay.textContent = "Error";
                let errorMsg = `HLS Error: Type=${message.payload.type}, Details=${message.payload.details}`;
                if (message.payload.url) { errorMsg += `, URL=${message.payload.url}`; }
                const errorElement = document.createElement('p');
                errorElement.textContent = errorMsg;
                errorsDisplay.appendChild(errorElement);
                break;
        }
    } catch (e) {
        console.error("Error processing message in side panel:", e);
    }
}

// Listen for runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message received in side panel:", message);
    processMessage(message);
    return false; // Don't keep channel open
});

// Get the active tab information when the panel opens
async function getActiveTabInfo() {
    try {
        const currentWindow = await chrome.windows.getCurrent();
        if (!currentWindow) throw new Error("Could not get current window.");

        const [activeTab] = await chrome.tabs.query({ active: true, windowId: currentWindow.id });
        console.log("Active tab:", activeTab);
        
        if (activeTab && activeTab.url) {
            if (activeTab.url.includes('.m3u8') || activeTab.url.includes('player.html')) {
                urlDisplay.textContent = activeTab.url;
                statusDisplay.textContent = 'Page loaded, waiting for player...';
            } else {
                urlDisplay.textContent = 'N/A (Active tab URL is not .m3u8)';
            }
        } else {
            urlDisplay.textContent = 'N/A (Could not get active tab info)';
        }
    } catch (error) {
        console.error("Error fetching active tab info:", error);
        urlDisplay.textContent = `Error: ${error.message}`;
    }
}

// Initialize panel
function initializePanel() {
    console.log("Initializing side panel");
    // Reset UI
    urlDisplay.textContent = 'Loading...';
    statusDisplay.textContent = 'Waiting for stream...';
    levelsDisplay.textContent = 'N/A';
    currentLevelDisplay.textContent = 'N/A';
    errorsDisplay.innerHTML = '';
    
    // Get active tab info
    getActiveTabInfo();
    
    // Fetch any stored messages
    fetchStoredMessages();
}

// Initialize panel when loaded
document.addEventListener('DOMContentLoaded', initializePanel);

// Add listeners for tab updates/activation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    initializePanel();
});

chrome.tabs.onActivated.addListener(activeInfo => {
    initializePanel();
});