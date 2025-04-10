// background.js
// https://d1ns9k5qrxc5w8.cloudfront.net/9bf31c7ff062936a067ca6938984d388/k8s/live/scte35.isml/.m3u8
// https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8

// background.js

// Function to fetch the player.html content
async function getPlayerHtml() {
    const response = await fetch(chrome.runtime.getURL('player.html'));
    return await response.text();
  }
  
  // Listen for messages from content scripts
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getPlayerUrl") {
      // Get the player HTML and send it back to the content script
      getPlayerHtml().then(playerHtml => {
        chrome.tabs.sendMessage(sender.tab.id, {
          action: "openPlayer",
          playerHtml: playerHtml,
          hlsUrl: message.hlsUrl
        });
      });
      
      // Store the HLS URL in local storage for the side panel
      chrome.storage.local.set({
        'currentHlsUrl': message.hlsUrl,
        'fileName': message.fileName || 'Stream'
      });
    }
  });
  
  // When the extension icon is clicked, open the side panel
  chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
  });