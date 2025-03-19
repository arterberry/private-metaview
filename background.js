// background.js
chrome.runtime.onInstalled.addListener(() => {
    console.log("HLS METAView Extension Installed");
});

// Handle toolbar icon click
chrome.action.onClicked.addListener((tab) => {
    createNewWindow();
});

// Function to create a new window
function createNewWindow() {
    chrome.windows.create({
        url: 'popup.html',
        type: 'popup',
        width: 1405,
        height: 930,
    });
}

// Optional: Add context menu for creating new instances
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'new-instance',
        title: 'Open new HLS MetaView instance',
        contexts: ['action']
    });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === 'new-instance') {
        createNewWindow();
    }
});