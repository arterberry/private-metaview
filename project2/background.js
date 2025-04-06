console.log("HLS Player (Content Script) - Background Script Loaded.");

// Define function to detect M3U8 URLs
function isM3u8Url(url) {
  try {
    const urlObj = new URL(url);
    return (
      urlObj.pathname.toLowerCase().endsWith('.m3u8') ||
      urlObj.pathname.toLowerCase().includes('.m3u8/') ||
      urlObj.pathname.toLowerCase().includes('/.m3u8') ||
      urlObj.pathname.toLowerCase().match(/\.m3u8[?#]/) ||
      urlObj.search.toLowerCase().includes('format=m3u8') ||
      urlObj.hash.toLowerCase().includes('format=m3u8')
    );
  } catch (e) {
    return false; // Invalid URL
  }
}

// Set up declarativeNetRequest rules to intercept M3U8 URLs
chrome.runtime.onInstalled.addListener(() => {
  // Remove any existing rules
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1]
  }).then(() => {
    // Add our rule to redirect M3U8 URLs to our player
    chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [{
        id: 1,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            // Using url pattern capturing instead of transform
            regexSubstitution: chrome.runtime.getURL('player.html') + '?src=\\0'
          }
        },
        condition: {
          regexFilter: ".*\\.m3u8.*",
          resourceTypes: ['main_frame']
        }
      }]
    }).catch(error => {
      console.error("Error setting up declarativeNetRequest rules:", error);
    });
  });
});

// --- Enable Side Panel when tab URL is .m3u8 ---
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Check if tab is complete and URL is M3U8
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if this is our player page
    if (tab.url.startsWith(chrome.runtime.getURL('player.html'))) {
      // This is our player page, enable the side panel
      try {
        await chrome.sidePanel.setOptions({
          tabId: tabId,
          enabled: true
        });
        console.log(`Side panel ENABLED for M3U8 player tab ${tabId}.`);
      } catch (error) {
        console.error(`Error enabling side panel for tab ${tabId}:`, error);
      }
    } else if (isM3u8Url(tab.url)) {
      // This is a direct M3U8 URL that wasn't redirected (should be rare with our rules)
      console.log(`M3U8 URL detected on completed tab ${tabId} but not redirected: ${tab.url}`);
      try {
        await chrome.sidePanel.setOptions({
          tabId: tabId,
          enabled: true
        });
        console.log(`Side panel ENABLED for direct M3U8 tab ${tabId}.`);
      } catch (error) {
        console.error(`Error enabling side panel for tab ${tabId}:`, error);
      }
    } else {
      // Not an M3U8 URL, disable the side panel if it was enabled
      try {
        const currentOptions = await chrome.sidePanel.getOptions({ tabId });
        if (currentOptions.enabled) {
          await chrome.sidePanel.setOptions({ tabId: tabId, enabled: false });
          console.log(`Side panel disabled for non-M3U8 tab ${tabId}.`);
        }
      } catch (error) { /* Ignore */ }
    }
  }
});

// --- Handle Toolbar Icon Click (Opens the panel) ---
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId) {
    console.log(`Action icon clicked for tab: ${tab.id}. Attempting to open side panel.`);
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (error) {
      console.error("Error opening side panel:", error);
    }
  } else {
    console.error("Cannot open side panel, windowId not found on tab.");
  }
});

// Add this to background.js
// --- Message Relay for Side Panel Communication ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Background received message:", message);
    // Relay all messages to ensure they reach the side panel
    chrome.runtime.sendMessage(message).catch(err => {
        console.log("Error relaying message:", err);
    });
    return false; // Don't keep the message channel open
});

console.log("Background script ready.");