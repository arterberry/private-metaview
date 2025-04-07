console.log("VIDINFRA HLS MetaPlayer - Background Script Loaded.");

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
    return false;
  }
}

// Set up redirect rule for .m3u8 URLs
chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [1] })
    .then(() => {
      chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [{
          id: 1,
          priority: 1,
          action: {
            type: 'redirect',
            redirect: {
              regexSubstitution: chrome.runtime.getURL('player.html') + '?src=\\0'
            }
          },
          condition: {
            regexFilter: ".*\\.m3u8.*",
            resourceTypes: ['main_frame']
          }
        }]
      });
    })
    .catch(error => {
      console.error("Error setting up redirect rules:", error);
    });
});

// Enable side panel only for player.html or .m3u8 URLs
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isPlayerPage = tab.url.startsWith(chrome.runtime.getURL('player.html'));
    const isStreamUrl = isM3u8Url(tab.url);

    try {
      if (isPlayerPage || isStreamUrl) {
        await chrome.sidePanel.setOptions({ tabId, enabled: true });
        console.log(`Side panel ENABLED for tab ${tabId}`);
      } else {
        const currentOptions = await chrome.sidePanel.getOptions({ tabId });
        if (currentOptions.enabled) {
          await chrome.sidePanel.setOptions({ tabId, enabled: false });
          console.log(`Side panel DISABLED for tab ${tabId}`);
        }
      }
    } catch (err) {
      console.error(`Error updating side panel options for tab ${tabId}:`, err);
    }
  }
});

// Handle toolbar icon click
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      console.log(`Opened side panel for window ${tab.windowId}`);
    } catch (error) {
      console.error("Error opening side panel:", error);
    }
  } else {
    console.error("No windowId found for toolbar click");
  }
});

// Store latest message per type and attempt to relay
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);

  if (!message || !message.type) return;

  // Store in local storage for later retrieval
  chrome.storage.local.set({
    [`latest_${message.type}`]: message
  }, () => {
    if (chrome.runtime.lastError) {
      console.error("Failed to store message:", chrome.runtime.lastError.message);
    } else {
      console.log(`Stored latest_${message.type} message`);
    }
  });

  // Relay only if it came from a tab context (e.g. player, content script)
  if (sender.tab) {
    chrome.runtime.sendMessage(message).catch(err => {
      console.warn("Relay failed — likely no listeners ready:", err.message);
    });
  }

  return false;
});
