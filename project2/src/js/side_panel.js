console.log("VIDINFRA HLS MetaPlayer Side panel script loaded.");

// DOM references
const urlDisplay = document.getElementById('m3u8Url');
const statusDisplay = document.getElementById('hlsStatus');
const levelsDisplay = document.getElementById('hlsLevels');
const currentLevelDisplay = document.getElementById('hlsCurrentLevel');
const errorsDisplay = document.getElementById('errors');

if (!urlDisplay || !statusDisplay || !errorsDisplay) {
    console.error("Missing one or more required DOM elements in side_panel.html");
}

// Fetch messages from storage when panel opens
function fetchStoredMessages() {
    chrome.storage.local.get(null, function (items) {
        if (chrome.runtime.lastError) {
            console.error("Error retrieving stored messages:", chrome.runtime.lastError.message);
            return;
        }

        console.log("Retrieved stored messages:", items);

        for (const key in items) {
            if (key.startsWith('latest_')) {
                const message = items[key];
                processMessage(message);
            }
        }
    });
}

// Runtime message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object') return false;

    console.log("Message received in side panel:", message);
    processMessage(message);
    return false;
});

// Process structured messages
function processMessage(message) {
    if (!message || typeof message !== 'object' || !message.type || !message.payload) {
        console.warn("Invalid message received, skipping:", message);
        return;
    }

    try {
        switch (message.type) {
            case "HLS_MANIFEST_DATA":
                setStatus("Playing");
                setLevels(message.payload.levels);
                currentLevelDisplay.textContent = "Initial";
                errorsDisplay.innerHTML = '';
                updateUrl(message.payload.url);
                break;

            case "HLS_LEVEL_SWITCH":
                if (message.payload.height && message.payload.bitrate) {
                    currentLevelDisplay.textContent = `${message.payload.height}p @ ${(message.payload.bitrate / 1000).toFixed(0)}kbps`;
                }
                break;

            case "NATIVE_HLS_PLAYBACK":
                setStatus("Playing (Native)");
                levelsDisplay.textContent = "N/A (Native)";
                currentLevelDisplay.textContent = "N/A (Native)";
                updateUrl(message.payload.url);
                break;

            case "HLS_NOT_SUPPORTED":
                setStatus("Error");
                errorsDisplay.innerHTML = `<p>HLS Not Supported by browser.</p>`;
                updateUrl(message.payload.url);
                break;

            case "HLS_ERROR":
                setStatus("Error");
                displayErrorDetails(message.payload);
                break;

            default:
                console.warn("Unhandled message type:", message.type);
        }
    } catch (err) {
        console.error("Exception while processing message:", err);
    }
}

// Get active tab URL and update initial UI
async function getActiveTabInfo() {
    try {
        const currentWindow = await chrome.windows.getCurrent();
        if (!currentWindow) throw new Error("Could not get current window");

        const [activeTab] = await chrome.tabs.query({ active: true, windowId: currentWindow.id });
        console.log("Active tab:", activeTab);

        if (activeTab && activeTab.url) {
            updateUrl(activeTab.url);

            if (activeTab.url.includes('.m3u8') || activeTab.url.includes('player.html')) {
                if (statusDisplay.textContent === 'Waiting for stream...') {
                    setStatus("Page loaded");
                }
            } else {
                setStatus("N/A");
            }
        } else {
            updateUrl('N/A (Could not retrieve tab)');
        }
    } catch (err) {
        console.error("Error retrieving tab info:", err);
        updateUrl(`Error: ${err.message}`);
    }
}

// UI update helpers
function setStatus(text) {
    if (statusDisplay) statusDisplay.textContent = text;
}

function updateUrl(text) {
    if (urlDisplay && text) urlDisplay.textContent = text;
}

function setLevels(levels) {
    if (!Array.isArray(levels)) {
        levelsDisplay.textContent = "Unknown";
        return;
    }

    levelsDisplay.textContent = levels.length > 0
        ? levels.map(l => `${l.height}p`).join(', ')
        : "Single level";
}

function displayErrorDetails(payload) {
    if (!payload || typeof payload !== 'object') return;

    let errorMsg = `HLS Error: Type=${payload.type}, Details=${payload.details}`;
    if (payload.url) errorMsg += `, URL=${payload.url}`;

    const errorElement = document.createElement('p');
    errorElement.textContent = errorMsg;
    errorsDisplay.appendChild(errorElement);
}

// Initialize the side panel
function initializePanel() {
    console.log("Initializing side panel");

    setStatus("Waiting for stream...");
    updateUrl("Loading...");
    errorsDisplay.innerHTML = '';

    getActiveTabInfo();
    fetchStoredMessages();
}

// Initialize once DOM is ready
document.addEventListener('DOMContentLoaded', initializePanel);

// Re-initialize on tab updates and activations
chrome.tabs.onUpdated.addListener(() => {
    initializePanel();
});
chrome.tabs.onActivated.addListener(() => {
    initializePanel();
});
