// background.js

const M3U8_TYPES = [
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "audio/mpegurl",
  "audio/x-mpegurl",
  "application/mpegurl",
  "video/mpegurl",
  // Add potentially problematic types that servers might send for m3u8
  "application/octet-stream",
  "text/plain"
];

// background.js - Using webNavigation and tabs API

chrome.webNavigation.onBeforeNavigate.addListener(
  (details) => {
      // Check if it's a main frame navigation and the URL ends with .m3u8 (with optional query string)
      // Using onBeforeNavigate to act as early as possible
      if (details.frameId === 0 && details.url && details.url.match(/\.m3u8(?:[?#]|$)/)) {

          console.log(`webNavigation: Detected navigation to M3U8: ${details.url} in tab ${details.tabId}`);

          // Construct the URL to our player page
          const playerPageUrl = chrome.runtime.getURL("player.html");
          const targetUrl = `${playerPageUrl}?src=${encodeURIComponent(details.url)}`;

          console.log(`webNavigation: Updating tab ${details.tabId} to URL: ${targetUrl}`);

          // Update the tab to navigate to our player page instead
          chrome.tabs.update(details.tabId, { url: targetUrl }, () => {
              if (chrome.runtime.lastError) {
                  console.error(`Error updating tab: ${chrome.runtime.lastError.message}`);
              } else {
                  console.log(`Tab ${details.tabId} update initiated.`);
              }
          });

          // Note: onBeforeNavigate does not have a way to truly "cancel" the navigation
          // in MV3 like blocking webRequest did. Updating the URL immediately is the
          // standard approach. The original navigation might briefly start but should
          // be quickly superseded by the update call.
      }
  },
  {
      // Filter for URLs potentially ending in .m3u8 - broad filter, JS checks the exact pattern
      url: [{ urlMatches: ".*\\.m3u8.*" }],
      // types: ["main_frame"] // Filtering by type is done via frameId check above
  }
);

console.log("HLS Player Background Script (webNavigation) loaded.");

chrome.runtime.onInstalled.addListener(() => {
  console.log("Simple HLS Player (Nav Capture) Extension Installed/Updated.");
});