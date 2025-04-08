// Basic HLS Player: Display .ts and .m3u8 feed data in the left panel
// and log response headers and bodies to console for each segment.
// Now also supports displaying selected segment's headers/body in right panel tabs.

console.log("VIDINFRA HLS MetaPlayer Segment Viewer Loaded");
document.addEventListener('DOMContentLoaded', () => {

    // const sidePanelButton = document.getElementById('side-panel-button');
    // if (sidePanelButton) {
    //     sidePanelButton.addEventListener('click', async () => {
    //         console.log('👁️ Side panel button clicked');
    //         try {
    //             const currentWindow = await chrome.windows.getCurrent();
    //             if (currentWindow) {
    //                 await chrome.sidePanel.open({ windowId: currentWindow.id });
    //                 console.log('Side panel opened');
    //             } else {
    //                 console.error('Could not get current window');
    //             }
    //         } catch (error) {
    //             console.error('Error opening side panel:', error);
    //         }
    //     });
    // } else {
    //     console.warn('Side panel button not found in DOM');
    // }

    const metadataContainer = document.getElementById('metadataContainer');
    const videoContainer = document.querySelector('.video-container');

    const resizeHandle = document.getElementById('metadataResizeHandle');
    let isDragging = false;

    let startY = 0;
    let startHeight = 0;

    resizeHandle.addEventListener('pointerdown', (e) => {
        isDragging = true;
        startY = e.clientY;
        startHeight = metadataContainer.getBoundingClientRect().height;

        resizeHandle.setPointerCapture(e.pointerId);

        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('pointermove', (e) => {
        if (!isDragging) return;

        const dy = e.clientY - startY;
        const newHeight = startHeight - dy;

        metadataContainer.style.height = `${newHeight}px`;
        videoContainer.style.height = `calc(100% - ${newHeight}px)`;

        console.log('Resizing...');
    });

    window.addEventListener('pointerup', () => {
        if (isDragging) console.log('Drag stopped');
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });

    const verticalHandle = document.getElementById('resizeHandleVertical');
    const metadataPanel = document.getElementById('metadataPanel');
    const videoElement = document.getElementById('hlsVideoPlayer');


    let isResizingHorizontally = false;
    let startX = 0;
    let startWidth = 0;
    let resizePointerId = null;
    let forceClearTimeout = null;

    verticalHandle.addEventListener('pointerdown', (e) => {

        if (videoElement) videoElement.style.pointerEvents = 'none';

        // Delay actual resizing to avoid early lock-in
        startX = e.clientX;
        startWidth = metadataPanel.getBoundingClientRect().width;

        isResizingHorizontally = true;
        resizePointerId = e.pointerId;

        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';

        // Delay setPointerCapture slightly to allow layout to settle
        requestAnimationFrame(() => {
            try {
                verticalHandle.setPointerCapture(resizePointerId);
            } catch (err) {
                console.warn('Pointer capture failed', err);
            }
        });

        // Force cleanup after 3s no matter what
        forceClearTimeout = setTimeout(() => {
            if (isResizingHorizontally) {
                console.warn('Auto-abort resizing after 3s timeout');
                cleanupResize();
            }
        }, 3000);
    });

    window.addEventListener('pointermove', (e) => {
        if (!isResizingHorizontally || e.pointerId !== resizePointerId) return;

        const dx = e.clientX - startX;
        const newWidth = startWidth + dx;

        if (newWidth < 100 || newWidth > window.innerWidth - 100) {
            console.warn('Reached min/max width limit — stopping drag');
            cleanupResize();
            return;
        }

        metadataPanel.style.width = `${newWidth}px`;
        metadataPanel.style.flex = `0 0 ${newWidth}px`;
        console.log('↔ Resizing horizontal...');
    });

    window.addEventListener('pointerup', (e) => {
        if (e.pointerId === resizePointerId) {
            console.log('↔ Pointer released normally');
            cleanupResize();
        }
    });

    window.addEventListener('blur', () => {
        if (isResizingHorizontally) {
            console.warn('Window blurred — cleaning up stuck resize');
            cleanupResize();
        }
    });

    window.addEventListener('pointercancel', () => {
        if (isResizingHorizontally) {
            console.warn('Pointer cancel triggered — cleaning up resize');
            cleanupResize();
        }
    });

    function cleanupResize() {
        if (videoElement) videoElement.style.pointerEvents = '';

        isResizingHorizontally = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        if (resizePointerId !== null && verticalHandle.hasPointerCapture(resizePointerId)) {
            try {
                verticalHandle.releasePointerCapture(resizePointerId);
            } catch (err) {
                console.warn('Failed to release pointer capture:', err);
            }
        }

        resizePointerId = null;

        if (forceClearTimeout) {
            clearTimeout(forceClearTimeout);
            forceClearTimeout = null;
        }
    }

    window.addEventListener('mouseleave', () => {
        if (isResizingHorizontally) {
            console.warn('Mouse left window — cleaning up');
            cleanupResize();
        }
    });
    

    const video = document.getElementById('hlsVideoPlayer');
    const metadataList = document.getElementById("metadataList");
    const urlParams = new URLSearchParams(window.location.search);
    const m3u8Src = urlParams.get('src');

    const segmentHeaders = new Map();
    const segmentBodies = new Map();

    if (!video || !m3u8Src) {
        console.error("Video element or M3U8 source missing");
        return;
    }

    if (!Hls.isSupported()) {
        video.src = decodeURIComponent(m3u8Src);
        video.addEventListener('loadedmetadata', () => {
            video.play().catch(e => console.warn("Autoplay failed:", e));
        });

        const masterFile = decodeURIComponent(m3u8Src).split('/').pop();
        const entry = document.createElement("div");
        entry.textContent = ` ${masterFile}`;
        entry.setAttribute("data-segment", masterFile);
        entry.addEventListener("click", () => displaySegmentData(masterFile));
        metadataList.appendChild(entry);

        return;
    }

    class CustomLoader extends Hls.DefaultConfig.loader {
        constructor(config) {
            super(config);
            const load = this.load.bind(this);

            this.load = function (context, config, callbacks) {
                const originalOnSuccess = callbacks.onSuccess;

                callbacks.onSuccess = function (response, stats, context, xhr) {
                    const url = context.url;
                    const file = url.split('/').pop();

                    if (file && (file.endsWith('.ts') || file.endsWith('.m3u8'))) {
                        const entry = document.createElement("div");
                        entry.textContent = ` ${file}`;
                        entry.setAttribute("data-segment", file);
                        entry.addEventListener("click", () => displaySegmentData(file));
                        metadataList.appendChild(entry);
                    }

                    
                    const rawHeaders = xhr.getAllResponseHeaders();
                    const headerMap = {};
                    rawHeaders.trim().split(/\r?\n/).forEach(line => {
                        const parts = line.split(': ');
                        if (parts.length === 2) {
                            headerMap[parts[0].trim()] = parts[1].trim();
                        }
                    });
                    headerMap["status"] = xhr.status;
                    headerMap["statusText"] = xhr.statusText;

                    if (window.CacheInspector) {
                        window.CacheInspector.simulateSegmentLoad(headerMap);
                    }                    

                    segmentHeaders.set(file, headerMap);
                    console.log(`[HEADERS] ${file}`, headerMap);

                    const ttlValue = parseTTLFromHeaders(headerMap);
                    document.getElementById('cacheTtlDisplay').textContent = ttlValue || 'No TTL information available';

                    let bodyText = "(binary or empty)";
                    try {
                        if (xhr.responseType === "arraybuffer" && xhr.response instanceof ArrayBuffer) {
                            const view = new Uint8Array(xhr.response);
                            bodyText = Array.from(view.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' ');
                        } else if (typeof xhr.responseText === 'string') {
                            bodyText = xhr.responseText;
                        }
                    } catch (e) {
                        console.error("Error capturing response body:", e);
                    }

                    segmentBodies.set(file, bodyText);
                    console.log(`[BODY] ${file}`, bodyText);

                    originalOnSuccess(response, stats, context, xhr);
                };

                load(context, config, callbacks);
            }
        }
    }

    const hls = new Hls({
        loader: CustomLoader
    });

    hls.loadSource(decodeURIComponent(m3u8Src));
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
        if (Array.isArray(data.levels)) {
            data.levels.forEach(level => {
                const entry = document.createElement("div");
                const resolution = `${level.width}x${level.height}`;
                const bitrate = `${Math.round(level.bitrate / 1000)} kbps`;
                entry.textContent = `Level: ${resolution}, Bitrate: ${bitrate}`;
                metadataList.appendChild(entry);
            });
        }
    });

    // Loading the STREAM DATA for the Side Panel
    hls.on(Hls.Events.MANIFEST_LOADED, function (event, data) {
        console.log("Manifest loaded:", data);
    
        const url = data.url;
    
        if (window.ResolutionAnalyzer) {
            window.ResolutionAnalyzer.fetchResolutions(url).then(res => { 
                window.ResolutionAnalyzer.renderToDOM(res, 'resolutionList');               
            });
        }
    
        if (window.CacheInspector) {
            window.CacheInspector.initGraph();
        }
    
        initializeInspector(url); 
    });
    

    // hls.on(Hls.Events.FRAG_LOADED, function (event, data) {
    //     const url = data.frag?.url || "[unknown segment URL]";
    //     const file = url.split('/').pop();
    //     const entry = document.createElement("div");
    //     entry.textContent = ` ${file}`;
    //     entry.setAttribute("data-segment", file);
    //     entry.addEventListener("click", () => displaySegmentData(file));
    //     metadataList.appendChild(entry);
    // });

    const headerPane = document.querySelector('#headers-tabUpdate');
    const bodyPane = document.querySelector('#body-tabUpdate');
    const headerContent = document.querySelector('#headers-tabUpdate pre');
    const bodyContent = document.querySelector('#body-tabUpdate pre');

    function displaySegmentData(segmentId) {
        console.log(`🔍 Display requested for segment: ${segmentId}`);

        const headers = segmentHeaders.get(segmentId);
        const body = segmentBodies.get(segmentId);

        if (headerContent) {
            headerContent.textContent = headers ? JSON.stringify(headers, null, 2) : "No header data available.";
        }

        if (bodyContent) {
            bodyContent.textContent = body || "No response body available.";
        }

        // Activate header pane
        if (headerPane && bodyPane) {
            headerPane.classList.add('active');
            bodyPane.classList.remove('active');
        }

        const tabButtons = document.querySelectorAll('.metadata_tab-buttonUpdate');
        const headerTabButton = document.querySelector('.metadata_tab-buttonUpdate[data-tab="headers"]');
        const bodyTabButton = document.querySelector('.metadata_tab-buttonUpdate[data-tab="body"]');

        tabButtons.forEach(btn => btn.classList.remove('active'));
        headerTabButton?.classList.add('active');
        bodyTabButton?.classList.remove('active');
    }

    // Handle tab clicks
    document.querySelectorAll('.metadata_tab-buttonUpdate').forEach(button => {
        button.addEventListener('click', () => {
            const tab = button.dataset.tab;

            // Deactivate all
            document.querySelectorAll('.metadata_tab-buttonUpdate').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.metadata_tab-paneUpdate, .metadata_tab-paneBodyUpdate').forEach(pane => pane.classList.remove('active'));

            // Activate selected
            button.classList.add('active');
            document.getElementById(`${tab}-tabUpdate`)?.classList.add('active');
        });
    });

    const sidePanel = document.getElementById('hlsInfoPanel');
    const toggleButton = document.getElementById('side-panel-button');
    const closeButton = document.getElementById('closeButton');
    
    if (toggleButton && sidePanel) {
        toggleButton.addEventListener('click', () => {
            sidePanel.classList.toggle('hidden');
        });
    }
    
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            sidePanel.classList.add('hidden');
        });
    }
    
});