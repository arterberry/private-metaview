// __mocks__/popup.js
// Mock implementation of popup.js functions for testing

// Mock the event handlers
const handlePlayVideo = jest.fn().mockImplementation(() => {
    const url = document.getElementById('hlsUrl').value;

    if (!url.endsWith('.m3u8')) {
        alert('Please enter a valid HLS URL (.m3u8)');
        return;
    }

    if (Hls.isSupported()) {
        const hls = new Hls();
        const video = document.getElementById('videoPlayer');
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, () => { });
        video.play();
    } else if (document.getElementById('videoPlayer').canPlayType('application/vnd.apple.mpegurl')) {
        const video = document.getElementById('videoPlayer');
        video.src = url;
        video.addEventListener('loadedmetadata', () => video.play());
    } else {
        alert('Your browser does not support HLS playback.');
    }
});

// Mock the metadata functions
const addMetadataEntry = jest.fn().mockImplementation((text, isError = false) => {
    const metadataList = document.getElementById('metadataList');
    const entry = document.createElement('div');

    if (text.includes('\n')) {
        entry.innerHTML = text.replace(/\n/g, '<br>');
    } else {
        entry.textContent = text;
    }

    if (isError) {
        entry.style.color = 'red';
        entry.style.fontWeight = 'bold';
    }

    metadataList.appendChild(entry);
});

// Mock the helper functions
const openHelperPopup = jest.fn().mockImplementation(() => {
    window.open('helper.html', 'playbackHelper', 'width=600,height=600');
});

// Mock the custom loader function
const createCustomLoader = jest.fn().mockReturnValue(function () { });

// Mock the manifest parsing function
const fetchAndParseManifest = jest.fn();

// Mock the resolution display function
const parseAndDisplayResolutions = jest.fn();

// Mock the header display function
const addHeadersToMetadata = jest.fn();

// Mock the fetch metadata function
const fetchMetadata = jest.fn();

// Export the mocked functions
module.exports = {
    handlePlayVideo,
    addMetadataEntry,
    openHelperPopup,
    createCustomLoader,
    fetchAndParseManifest,
    parseAndDisplayResolutions,
    addHeadersToMetadata,
    fetchMetadata
};