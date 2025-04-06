console.log("Side panel script loaded.");

const urlDisplay = document.getElementById('m3u8Url');
const statusDisplay = document.getElementById('hlsStatus');
const levelsDisplay = document.getElementById('hlsLevels');
const currentLevelDisplay = document.getElementById('hlsCurrentLevel');
const errorsDisplay = document.getElementById('errors');

let currentM3u8Url = null; // Store the URL for context

async function getActiveStreamData() {
    // Reset UI elements
    if (!urlDisplay || !statusDisplay || !levelsDisplay || !currentLevelDisplay || !errorsDisplay) {
        console.error("Required display elements not found.");
        return;
    }
    urlDisplay.textContent = 'Loading...';
    statusDisplay.textContent = 'Waiting for stream...';
    levelsDisplay.textContent = 'N/A';
    currentLevelDisplay.textContent = 'N/A';
    errorsDisplay.innerHTML = '';
    currentM3u8Url = null; // Reset context


    try {
        const currentWindow = await chrome.windows.getCurrent();
        if (!currentWindow) throw new Error("Could not get current window.");

        const [activeTab] = await chrome.tabs.query({ active: true, windowId: currentWindow.id });

        // Check if the active tab's URL seems to be an M3U8 handled by our content script
        if (activeTab && activeTab.url) {
            let isM3u8 = false;
            let potentialUrl = activeTab.url;
            try {
                const urlObj = new URL(potentialUrl);
                if (urlObj.pathname.toLowerCase().endsWith('.m3u8') ||
                    urlObj.pathname.toLowerCase().includes('.m3u8/') ||
                    urlObj.pathname.toLowerCase().includes('/.m3u8')) {
                    isM3u8 = true;
                }
            } catch (e) { /* Ignore invalid URLs */ }

            if (isM3u8) {
                currentM3u8Url = potentialUrl; // Store and display
                urlDisplay.textContent = currentM3u8Url;
                statusDisplay.textContent = 'Page loaded, waiting for player...'; // Initial status
            } else {
                urlDisplay.textContent = 'N/A (Active tab URL is not .m3u8)';
            }
        } else {
            urlDisplay.textContent = 'N/A (Could not get active tab info)';
        }
    } catch (error) {
        urlDisplay.textContent = `Error: ${error.message}`;
        console.error("Error fetching active tab info:", error);
    }
}

// --- Listen for messages from content.js ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message received in side panel:", message);

    // Check if the message is from the tab we are currently displaying info for
    // if (!currentM3u8Url || !sender.tab || sender.tab.url !== currentM3u8Url) {
    //     // console.log("Ignoring message, not from the active M3U8 tab:", sender.tab?.url);
    //     return; // Ignore messages not from the relevant tab
    // }

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
                break;
            
            // Rest of the switch case remains the same
            // ...
        }
    } catch (e) {
        console.error("Error processing message in side panel:", e);
    }

    // try {
    //     switch (message.type) {
    //         case "HLS_MANIFEST_DATA":
    //             statusDisplay.textContent = "Playing";
    //             if (message.payload.levels && message.payload.levels.length > 0) {
    //                 levelsDisplay.textContent = message.payload.levels.map(l => `${l.height}p`).join(', ');
    //             } else {
    //                 levelsDisplay.textContent = "Single level";
    //             }
    //             currentLevelDisplay.textContent = "Initial";
    //             errorsDisplay.innerHTML = '';
    //             break;

    //         case "HLS_LEVEL_SWITCH":
    //             currentLevelDisplay.textContent = `${message.payload.height}p @ ${(message.payload.bitrate / 1000).toFixed(0)}kbps`;
    //             break;

    //         case "NATIVE_HLS_PLAYBACK":
    //             statusDisplay.textContent = "Playing (Native)";
    //             levelsDisplay.textContent = "N/A (Native)";
    //             currentLevelDisplay.textContent = "N/A (Native)";
    //             break;

    //         case "HLS_NOT_SUPPORTED":
    //             statusDisplay.textContent = "Error";
    //             errorsDisplay.innerHTML = `<p>HLS Not Supported by browser.</p>`;
    //             break;

    //         case "HLS_ERROR":
    //             statusDisplay.textContent = "Error";
    //             let errorMsg = `HLS Error: Type=${message.payload.type}, Details=${message.payload.details}`;
    //             if (message.payload.url) { errorMsg += `, URL=${message.payload.url}`; }
    //             const errorElement = document.createElement('p');
    //             errorElement.textContent = errorMsg;
    //             errorsDisplay.appendChild(errorElement);
    //             break;
    //     }
    // } catch (e) {
    //     console.error("Error processing message in side panel:", e);
    // }
});

// --- Run when the panel loads or updates ---
function initializePanel() {
    getActiveStreamData();
}

document.addEventListener('DOMContentLoaded', initializePanel);

// Add listeners for tab updates/activation to re-initialize if context changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    chrome.windows.getCurrent(async (currentWindow) => {
        if (!currentWindow) return;
        const [activeTab] = await chrome.tabs.query({ active: true, windowId: currentWindow.id });
        if (activeTab && tabId === activeTab.id && (changeInfo.status === 'complete' || changeInfo.url)) {
            initializePanel();
        }
    });
});
chrome.tabs.onActivated.addListener(activeInfo => {
    chrome.windows.getCurrent(async (currentWindow) => {
        if (!currentWindow) return;
        const [activeTab] = await chrome.tabs.query({ active: true, windowId: currentWindow.id });
        if (activeTab && activeInfo.windowId === currentWindow.id) {
            initializePanel();
        }
    });
});