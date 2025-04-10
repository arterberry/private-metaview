// content.js

// Function to detect if the current URL is an HLS stream (.m3u8)
function isHlsUrl(url) {
    return url.endsWith('.m3u8') || url.includes('.m3u8?') ||
        url.includes('/playlist.m3u8') || url.includes('isml/.m3u8');
}

// Skip hijack if we're already in the player
if (
    isHlsUrl(window.location.href) &&
    !window.location.pathname.includes('player.html')
) {
    console.log("[content.js] Detected raw .m3u8 URL — launching player");

    chrome.runtime.sendMessage({
        action: "getPlayerUrl",
        hlsUrl: window.location.href
    });
}

// Handle file drop logic only if not in player.html
if (!window.location.pathname.includes('player.html')) {
    document.addEventListener('dragover', (event) => {
        for (let i = 0; i < event.dataTransfer.items.length; i++) {
            const item = event.dataTransfer.items[i];
            if (
                item.kind === 'file' &&
                (item.type === 'application/x-mpegurl' ||
                    item.getAsFile().name.endsWith('.m3u8'))
            ) {
                event.preventDefault();
                return;
            }
        }
    });

    document.addEventListener('drop', (event) => {
        event.preventDefault();
        const files = event.dataTransfer.files;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.name.endsWith('.m3u8')) {
                const objectUrl = URL.createObjectURL(file);
                chrome.runtime.sendMessage({
                    action: "getPlayerUrl",
                    hlsUrl: objectUrl,
                    fileName: file.name
                });
                return;
            }
        }
    });
}

// Listener to handle injected player from background — optional now
chrome.runtime.onMessage.addListener((message) => {
    if (
        message.action === "openPlayer" &&
        !window.location.pathname.includes('player.html')
    ) {
        console.log("[content.js] Injecting minimal player fallback");
        document.documentElement.innerHTML = message.playerHtml;

        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('js/hls.min.js');
        script.onload = () => {
            const playerScript = document.createElement('script');
            playerScript.textContent = `
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
