// content.js

// Function to detect if the current URL is an HLS stream (.m3u8)
function isHlsUrl(url) {
    return url.endsWith('.m3u8') || url.includes('.m3u8?') ||
        url.includes('/playlist.m3u8') || url.includes('isml/.m3u8');
}

// Function to handle file drops
function handleFileDrop(event) {
    event.preventDefault();

    const files = event.dataTransfer.files;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.name.endsWith('.m3u8')) {
            // Create object URL for the dropped file
            const objectUrl = URL.createObjectURL(file);

            // Load the player with the file URL
            loadPlayer(objectUrl, file.name);
            return;
        }
    }
}

// Main function to handle HLS URLs or file drops
function loadPlayer(hlsUrl, fileName = '') {
    // Get the extension's chrome-extension:// URL
    chrome.runtime.sendMessage({
        action: "getPlayerUrl",
        hlsUrl: hlsUrl,
        fileName: fileName
    });
}

// Listen for drop events on the entire document
document.addEventListener('dragover', (event) => {
    // Check if any of the items being dragged is an .m3u8 file
    for (let i = 0; i < event.dataTransfer.items.length; i++) {
        const item = event.dataTransfer.items[i];
        if (item.kind === 'file' && item.type === 'application/x-mpegurl' ||
            (item.kind === 'file' && item.getAsFile().name.endsWith('.m3u8'))) {
            // If it's an .m3u8 file, prevent the default behavior and show drop is possible
            event.preventDefault();
            return;
        }
    }
});

document.addEventListener('drop', handleFileDrop);

// Check if the current page is an m3u8 file
if (isHlsUrl(window.location.href)) {
    // If the current page is an m3u8 file, load the player
    loadPlayer(window.location.href);
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "openPlayer") {
        // Replace the current page with the player page
        document.documentElement.innerHTML = message.playerHtml;

        // Execute the necessary scripts
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('js/hls.min.js');
        script.onload = () => {
            const playerScript = document.createElement('script');
            playerScript.textContent = `
          // Initialize the player with the HLS URL
          const player = document.getElementById('hlsVideoPlayer');
          const hls = new Hls();
          hls.loadSource("${message.hlsUrl}");
          hls.attachMedia(player);
          hls.on(Hls.Events.MANIFEST_PARSED, function() {
            player.play();
          });
        `;
            document.body.appendChild(playerScript);
        };
        document.body.appendChild(script);
    }
});