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

 My next goal is to work on playing this across multiple CDNs under test and then build comprehensive unit tests. Then make certain that in its current form - it is finding SCTE35 without issue.

*/

// background.js

// Function to fetch the player.html content
async function getPlayerHtml() {
	const response = await fetch(chrome.runtime.getURL('player.html'));
	return await response.text();
}


chrome.webNavigation.onBeforeNavigate.addListener(
    (details) => {
      if (details.frameId === 0 && details.url && details.url.match(/\.m3u8(?:[?#]|$)/)) {
        const playerPageUrl = chrome.runtime.getURL("player.html");
        const targetUrl = `${playerPageUrl}?src=${encodeURIComponent(details.url)}`;
  
        chrome.tabs.update(details.tabId, { url: targetUrl }, () => {
          if (chrome.runtime.lastError) {
            console.error(`Tab update error: ${chrome.runtime.lastError.message}`);
          }
        });
      }
    },
    {
      url: [{ urlMatches: ".*\\.m3u8.*" }]
    }
  );
  
  chrome.runtime.onInstalled.addListener(() => {
    console.log("VIDINFRA HLS MetaPlayer installed.");
  });
  

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