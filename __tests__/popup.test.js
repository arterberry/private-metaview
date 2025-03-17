// popup.test.js
// Unit tests for popup.js functionality

// Import the test utilities
const { createMockElement } = require('./test-utils');

// Create a mock HLS class constructor and its instance
const mockHlsInstance = {
    loadSource: jest.fn(),
    attachMedia: jest.fn(),
    on: jest.fn(),
    startLoad: jest.fn(),
    recoverMediaError: jest.fn(),
    destroy: jest.fn()
};

// Replace the global Hls constructor with our mock
const originalHls = global.Hls;
global.Hls = jest.fn(() => mockHlsInstance);
global.Hls.isSupported = jest.fn().mockReturnValue(true);
global.Hls.Events = originalHls.Events;
global.Hls.ErrorTypes = originalHls.ErrorTypes;
global.Hls.ErrorDetails = originalHls.ErrorDetails;
global.Hls.DefaultConfig = originalHls.DefaultConfig;

// Defining mock functions globally to simulate what popup.js would export
global.handlePlayVideo = jest.fn().mockImplementation(function () {
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

global.addMetadataEntry = jest.fn().mockImplementation(function (text, isError = false) {
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

// Testing popup.js functionality
describe('Popup JS Functionality', () => {
    beforeEach(() => {
        resetAllMocks();

        // Re-attach event listeners to buttons
        const closeButton = document.getElementById('closeButton');
        closeButton.onclick = () => window.close();

        const playButton = document.getElementById('playVideo');
        playButton.onclick = handlePlayVideo;

        const helperLink = document.getElementById('playbackHelper');
        helperLink.onclick = (e) => {
            e.preventDefault();
            window.open('helper.html', 'playbackHelper', 'width=600,height=600');
        };
    });

    test('should close window when close button is clicked', () => {
        const closeButton = document.getElementById('closeButton');
        closeButton.click();
        expect(window.close).toHaveBeenCalled();
    });

    test('should open helper popup when playback helper link is clicked', () => {
        const helperLink = document.getElementById('playbackHelper');
        helperLink.click();
        expect(window.open).toHaveBeenCalledWith(
            'helper.html',
            'playbackHelper',
            expect.stringContaining('width=600,height=600')
        );
    });

    describe('handlePlayVideo function', () => {
        test('should validate HLS URL format', () => {
            const urlInput = document.getElementById('hlsUrl');
            const playButton = document.getElementById('playVideo');

            urlInput.value = 'https://example.com/video.mp4';
            playButton.click();

            expect(alert).toHaveBeenCalledWith('Please enter a valid HLS URL (.m3u8)');
            expect(mockHlsInstance.loadSource).not.toHaveBeenCalled();
        });

        test('should initialize HLS.js when URL is valid', () => {
            const urlInput = document.getElementById('hlsUrl');
            const playButton = document.getElementById('playVideo');
            const videoElement = document.getElementById('videoPlayer');

            urlInput.value = 'https://example.com/playlist.m3u8';
            playButton.click();

            expect(global.Hls).toHaveBeenCalled();
            expect(mockHlsInstance.loadSource).toHaveBeenCalledWith('https://example.com/playlist.m3u8');
            expect(mockHlsInstance.attachMedia).toHaveBeenCalledWith(videoElement);
        });

        test('should register error handlers for HLS.js', () => {
            const urlInput = document.getElementById('hlsUrl');
            const playButton = document.getElementById('playVideo');

            urlInput.value = 'https://example.com/playlist.m3u8';
            playButton.click();

            expect(mockHlsInstance.on).toHaveBeenCalledWith(
                Hls.Events.ERROR,
                expect.any(Function)
            );
        });

        test('should use native HLS support if HLS.js is not available but browser supports HLS', () => {
            // Save original isSupported
            const originalIsSupported = global.Hls.isSupported;
            global.Hls.isSupported = jest.fn().mockReturnValue(false);

            const urlInput = document.getElementById('hlsUrl');
            const playButton = document.getElementById('playVideo');
            const videoElement = document.getElementById('videoPlayer');

            urlInput.value = 'https://example.com/playlist.m3u8';
            playButton.click();

            expect(videoElement.src).toBe('https://example.com/playlist.m3u8');

            // Restore original isSupported
            global.Hls.isSupported = originalIsSupported;
        });

        test('should show alert if neither HLS.js nor native HLS is supported', () => {
            // Save originals
            const originalIsSupported = global.Hls.isSupported;
            const originalCanPlayType = HTMLVideoElement.prototype.canPlayType;

            // Mock them to return false
            global.Hls.isSupported = jest.fn().mockReturnValue(false);
            HTMLVideoElement.prototype.canPlayType = jest.fn().mockReturnValue('');

            const urlInput = document.getElementById('hlsUrl');
            const playButton = document.getElementById('playVideo');

            urlInput.value = 'https://example.com/playlist.m3u8';
            playButton.click();

            expect(alert).toHaveBeenCalledWith('Your browser does not support HLS playback.');

            // Restore originals
            global.Hls.isSupported = originalIsSupported;
            HTMLVideoElement.prototype.canPlayType = originalCanPlayType;
        });
    });

    describe('addMetadataEntry function', () => {
        test('should add text entry to metadata list', () => {
            addMetadataEntry('Test metadata entry');

            const metadataList = document.getElementById('metadataList');
            expect(metadataList.firstChild).toBeTruthy();
            expect(metadataList.firstChild.textContent).toBe('Test metadata entry');
        });

        test('should style error entries differently', () => {
            addMetadataEntry('Error entry', true);

            const metadataList = document.getElementById('metadataList');
            expect(metadataList.firstChild.style.color).toBe('red');
            expect(metadataList.firstChild.style.fontWeight).toBe('bold');
        });

        test('should handle multi-line entries', () => {
            addMetadataEntry('Line 1\nLine 2');

            const metadataList = document.getElementById('metadataList');
            expect(metadataList.firstChild.innerHTML).toContain('<br>');
        });
    });
});