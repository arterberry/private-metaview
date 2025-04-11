// background.js
/*
https://d1ns9k5qrxc5w8.cloudfront.net/9bf31c7ff062936a067ca6938984d388/k8s/live/scte35.isml/.m3u8

https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8

*/

/*
 NEXT TASKS
 CDN tagging
 CMCD parsing
 timeline correlation

*/

// background.js

// Function to fetch the player.html content
async function getPlayerHtml() {
	const response = await fetch(chrome.runtime.getURL('player.html'));
	return await response.text();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getPlayerUrl") {
        const encodedUrl = message.hlsUrl;
        
        console.log('[background] Received HLS URL:', encodedUrl);
        
        // Don't try to decode the URL at all
        getPlayerHtml().then(playerHtml => {
            // Only inject if we're not already in the player tab
            if (!sender.url.includes('player.html')) {
                chrome.tabs.sendMessage(sender.tab.id, {
                    action: "openPlayer",
                    hlsUrl: encodedUrl // Pass without modification
                });
            }
        });
        
        // Store as-is for history/debugging
        chrome.storage.local.set({
            'currentHlsUrl': encodedUrl,
            'fileName': message.fileName || 'Stream'
        });
    }
});

// When the extension icon is clicked, open the side panel
chrome.action.onClicked.addListener((tab) => {
	chrome.sidePanel.open({ tabId: tab.id });
});