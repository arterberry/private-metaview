// Basic HLS Player: Display .ts and .m3u8 feed data in the left panel
// and log response headers and bodies to console for each segment.
// Now also supports displaying selected segment's headers/body in right panel tabs.

console.log("Enhanced HLS Feed Segment Viewer Loaded");
document.addEventListener('DOMContentLoaded', () => {

    const sidePanelButton = document.getElementById('side-panel-button');
    if (sidePanelButton) {
        sidePanelButton.addEventListener('click', async () => {
            console.log('👁️ Side panel button clicked');
            try {
                const currentWindow = await chrome.windows.getCurrent();
                if (currentWindow) {
                    await chrome.sidePanel.open({ windowId: currentWindow.id });
                    console.log('Side panel opened');
                } else {
                    console.error('Could not get current window');
                }
            } catch (error) {
                console.error('Error opening side panel:', error);
            }
        });
    } else {
        console.warn('Side panel button not found in DOM');
    }
    
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

    let isResizingHorizontally = false;
    let startX = 0;
    let startWidth = 0;

    verticalHandle.addEventListener('pointerdown', (e) => {
        isResizingHorizontally = true;
        startX = e.clientX;
        startWidth = metadataPanel.getBoundingClientRect().width;

        verticalHandle.setPointerCapture(e.pointerId);

        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    });

    window.addEventListener('pointermove', (e) => {
        if (!isResizingHorizontally) return;

        const dx = e.clientX - startX;
        const newWidth = startWidth + dx;

        metadataPanel.style.width = `${newWidth}px`;
        metadataPanel.style.flex = `0 0 ${newWidth}px`;
        console.log('↔Resizing horizontal...');
    });

    window.addEventListener('pointerup', () => {
        if (isResizingHorizontally) {
            console.log('Horizontal drag complete');
        }

        isResizingHorizontally = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
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

                    segmentHeaders.set(file, headerMap);
                    console.log(`[HEADERS] ${file}`, headerMap);

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

    hls.on(Hls.Events.FRAG_LOADED, function (event, data) {
        const url = data.frag?.url || "[unknown segment URL]";
        const file = url.split('/').pop();
        const entry = document.createElement("div");
        entry.textContent = ` ${file}`;
        entry.setAttribute("data-segment", file);
        entry.addEventListener("click", () => displaySegmentData(file));
        metadataList.appendChild(entry);
    });

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


    // function displaySegmentData(segmentId) {
    //     console.log(`🔍 Display requested for segment: ${segmentId}`);

    //     const headers = segmentHeaders.get(segmentId);
    //     const body = segmentBodies.get(segmentId);

    //     console.log("Headers found:", headers);
    //     console.log("Body found:", body ? body.substring(0, 80) + "..." : "(no body)");

    //     if (headerContent) {
    //         headerContent.textContent = headers ? JSON.stringify(headers, null, 2) : "No header data available.";
    //     } else {
    //         console.warn("⚠️ headerContent element not found in DOM.");
    //     }

    //     if (bodyContent) {
    //         bodyContent.textContent = body || "No response body available.";
    //     } else {
    //         console.warn("⚠️ bodyContent element not found in DOM.");
    //     }

    //     // Activate only the headers tab
    //     const headerPane = document.querySelector('#headers-tabUpdate');
    //     const bodyPane = document.querySelector('#body-tab');
    //     if (headerPane && bodyPane) {
    //         headerPane.classList.add('active');
    //         bodyPane.classList.remove('active');
    //     }

    //     const tabButtons = document.querySelectorAll('.metadata_tab-buttonUpdate');
    //     const headerTabButton = document.querySelector('.metadata_tab-buttonUpdate[data-tab="headers"]');
    //     const bodyTabButton = document.querySelector('.metadata_tab-buttonUpdate[data-tab="body"]');

    //     tabButtons.forEach(btn => btn.classList.remove('active'));
    //     headerTabButton?.classList.add('active');
    //     bodyTabButton?.classList.remove('active');
    // };

    // document.querySelectorAll('.metadata_tab-buttonUpdate').forEach(button => {
    //     button.addEventListener('click', () => {
    //         const tab = button.dataset.tab;
    
    //         // Deactivate all buttons and tab panes
    //         document.querySelectorAll('.metadata_tab-buttonUpdate').forEach(btn => btn.classList.remove('active'));
    //         document.querySelectorAll('.metadata_tab-paneUpdate').forEach(pane => pane.classList.remove('active'));
    
    //         // Activate clicked button and its tab pane
    //         button.classList.add('active');
    //         document.getElementById(`${tab}-tab`)?.classList.add('active');
    //     });
    // });
    
});

// console.log("Enhanced HLS Feed Segment Viewer Loaded");

// document.addEventListener('DOMContentLoaded', () => {
//     const video = document.getElementById('hlsVideoPlayer');
//     const metadataList = document.getElementById("metadataList");
//     const headerContent = document.getElementById("headerContent");
//     const bodyContent = document.getElementById("bodyContent");
//     const urlParams = new URLSearchParams(window.location.search);
//     const m3u8Src = urlParams.get('src');

//     const segmentHeaders = new Map();
//     const segmentBodies = new Map();

//     if (!video || !m3u8Src) {
//         console.error("Video element or M3U8 source missing");
//         return;
//     }

//     if (!Hls.isSupported()) {
//         video.src = decodeURIComponent(m3u8Src);
//         video.addEventListener('loadedmetadata', () => {
//             video.play().catch(e => console.warn("Autoplay failed:", e));
//         });

//         const masterFile = decodeURIComponent(m3u8Src).split('/').pop();
//         const entry = document.createElement("div");
//         entry.textContent = ` ${masterFile}`;
//         entry.setAttribute("data-segment", masterFile);
//         entry.addEventListener("click", () => displaySegmentData(masterFile));
//         metadataList.appendChild(entry);

//         return;
//     }

//     class CustomLoader extends Hls.DefaultConfig.loader {
//         constructor(config) {
//             super(config);
//             const load = this.load.bind(this);

//             this.load = function (context, config, callbacks) {
//                 const originalOnSuccess = callbacks.onSuccess;

//                 callbacks.onSuccess = function (response, stats, context, xhr) {
//                     const url = context.url;
//                     const file = url.split('/').pop();

//                     if (file && (file.endsWith('.ts') || file.endsWith('.m3u8'))) {
//                         const entry = document.createElement("div");
//                         entry.textContent = ` ${file}`;
//                         entry.setAttribute("data-segment", file);
//                         entry.addEventListener("click", () => displaySegmentData(file));
//                         metadataList.appendChild(entry);
//                     }

//                     const rawHeaders = xhr.getAllResponseHeaders();
//                     const headerMap = {};
//                     rawHeaders.trim().split(/\r?\n/).forEach(line => {
//                         const parts = line.split(': ');
//                         if (parts.length === 2) {
//                             headerMap[parts[0].trim()] = parts[1].trim();
//                         }
//                     });
//                     headerMap["status"] = xhr.status;
//                     headerMap["statusText"] = xhr.statusText;

//                     segmentHeaders.set(file, headerMap);
//                     console.log(`[HEADERS] ${file}`, headerMap);

//                     let bodyText = "(binary or empty)";
//                     try {
//                         if (xhr.responseType === "arraybuffer" && xhr.response instanceof ArrayBuffer) {
//                             const view = new Uint8Array(xhr.response);
//                             bodyText = Array.from(view.slice(0, 32)).map(b => b.toString(16).padStart(2, '0')).join(' ');
//                         } else if (typeof xhr.responseText === 'string') {
//                             bodyText = xhr.responseText;
//                         }
//                     } catch (e) {
//                         console.error("Error capturing response body:", e);
//                     }

//                     segmentBodies.set(file, bodyText);
//                     console.log(`[BODY] ${file}`, bodyText);

//                     originalOnSuccess(response, stats, context, xhr);
//                 };

//                 load(context, config, callbacks);
//             }
//         }
//     }

//     const hls = new Hls({
//         loader: CustomLoader
//     });

//     hls.loadSource(decodeURIComponent(m3u8Src));
//     hls.attachMedia(video);

//     hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
//         if (Array.isArray(data.levels)) {
//             data.levels.forEach(level => {
//                 const entry = document.createElement("div");
//                 const resolution = `${level.width}x${level.height}`;
//                 const bitrate = `${Math.round(level.bitrate / 1000)} kbps`;
//                 entry.textContent = `Level: ${resolution}, Bitrate: ${bitrate}`;
//                 metadataList.appendChild(entry);
//             });
//         }
//     });

//     hls.on(Hls.Events.FRAG_LOADED, function (event, data) {
//         const url = data.frag?.url || "[unknown segment URL]";
//         const file = url.split('/').pop();
//         const entry = document.createElement("div");
//         entry.textContent = ` ${file}`;
//         entry.setAttribute("data-segment", file);
//         entry.addEventListener("click", () => displaySegmentData(file));
//         metadataList.appendChild(entry);
//     });

//     function displaySegmentData(segmentId) {
//         console.log(`🔍 Display requested for segment: ${segmentId}`);

//         const headers = segmentHeaders.get(segmentId);
//         const body = segmentBodies.get(segmentId);

//         console.log("Headers found:", headers);
//         console.log("Body found:", body ? body.substring(0, 80) + "..." : "(no body)");

//         if (headerContent) {
//             headerContent.textContent = headers ? JSON.stringify(headers, null, 2) : "No header data available.";
//         } else {
//             console.warn("⚠️ headerContent element not found in DOM.");
//         }

//         if (bodyContent) {
//             bodyContent.textContent = body || "No response body available.";
//         } else {
//             console.warn("⚠️ bodyContent element not found in DOM.");
//         }

//         const tabPanes = document.querySelectorAll('.metadata_tab-pane');
//         const headerPane = document.querySelector('#headers-tab');
//         const bodyPane = document.querySelector('#body-tab');

//         if (tabPanes.length === 0 || !headerPane || !bodyPane) {
//             console.warn("⚠️ Tab panes or tab content elements not found.");
//         }

//         tabPanes.forEach(pane => pane.classList.remove('active'));
//         headerPane?.classList.add('active');

//         const tabButtons = document.querySelectorAll('.metadata_tab-button');
//         const headerTabButton = document.querySelector('.metadata_tab-button[data-tab="headers"]');

//         if (tabButtons.length === 0 || !headerTabButton) {
//             console.warn("⚠️ Tab buttons or headers tab button not found.");
//         }

//         tabButtons.forEach(btn => btn.classList.remove('active'));
//         headerTabButton?.classList.add('active');
//     }
// });

// /**
//  * HLS Player Page Script
//  * Handles video playback, UI interactions, and HLS.js integration.
//  */

// console.log("HLS Player Page Script Loaded.");

// document.addEventListener('DOMContentLoaded', () => {
//     // ---- DOM Elements ----
//     const elements = {
//         video: document.getElementById('hlsVideoPlayer'),
//         resizeHandle: document.getElementById('resizeHandle'),
//         videoContainer: document.querySelector('.video-container'),
//         metadataSection: document.querySelector('.metadata-section'),
//         mainContainer: document.querySelector('.main-container'),
//         statusBar: document.getElementById('statusBar'),
//         sidePanelButton: document.getElementById('side-panel-button'),
//         clearButton: document.getElementById('clearDataButton'),
//         tabButtons: document.querySelectorAll('.metadata_tab-button'),
//         headerContent: document.getElementById('headerContent'),
//         bodyContent: document.getElementById('bodyContent')
//     };

//     // ---- URL Parameters ----
//     const urlParams = new URLSearchParams(window.location.search);
//     const m3u8Src = urlParams.get('src'); // Get the original M3U8 URL

//     // ---- Status Bar Functionality ----
//     function updateStatusBar(text) {
//         if (elements.statusBar) {
//             elements.statusBar.textContent = text;
//         }
//     }

//     // Expose function for external components
//     window.updatePlayerStatus = updateStatusBar;

//     // Initialize with basic info
//     updateStatusBar('Ready');

//     // ---- Initialize UI Components ----
//     initializeResizeHandler();
//     initializeTabButtons();
//     initializeSidePanelButton();
//     initializeClearButton();

//     // ---- Video Player Initialization ----
//     if (!elements.video) {
//         console.error("Video element not found!");
//         return;
//     }

//     if (!m3u8Src) {
//         console.error("M3U8 source URL not found in query parameters!");
//         document.body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Error: M3U8 source URL missing.</p>';
//         return;
//     }

//     console.log(`Attempting to play HLS stream: ${m3u8Src}`);

//     // Add metadata entry showing the stream URL
//     if (window.addMetadataEntry) {
//         addMetadataEntry(`Loading stream: ${decodeURIComponent(m3u8Src)}`, false, true);
//     }

//     // Initialize HLS player
//     initializeHlsPlayer();

//     /**
//      * Initialize resize handler for video and metadata panels
//      */
//     function initializeResizeHandler() {
//         if (!elements.resizeHandle) return;

//         let isResizing = false;
//         let startY, startHeightVideo, startHeightMetadata;

//         elements.resizeHandle.addEventListener('mousedown', function (e) {
//             isResizing = true;
//             startY = e.clientY;
//             startHeightVideo = elements.videoContainer.offsetHeight;
//             startHeightMetadata = elements.metadataSection.offsetHeight;

//             // Prevent text selection during resize
//             document.body.style.userSelect = 'none';
//             updateStatusBar('Resizing metadata panel...');
//         });

//         document.addEventListener('mousemove', function (e) {
//             if (!isResizing) return;

//             // Calculate how much to resize
//             const deltaY = startY - e.clientY;
//             const totalHeight = elements.mainContainer.offsetHeight;

//             // Adjust heights with minimum constraints
//             let newVideoHeight = Math.max(200, startHeightVideo - deltaY);
//             let newMetadataHeight = totalHeight - newVideoHeight;

//             if (newMetadataHeight < 100) {
//                 newMetadataHeight = 100;
//                 newVideoHeight = totalHeight - newMetadataHeight;
//             }

//             // Apply new heights as percentages
//             elements.videoContainer.style.height = (newVideoHeight / totalHeight * 100) + '%';
//             elements.metadataSection.style.height = (newMetadataHeight / totalHeight * 100) + '%';
//         });

//         document.addEventListener('mouseup', function () {
//             if (isResizing) {
//                 isResizing = false;
//                 document.body.style.userSelect = '';
//                 updateStatusBar('Ready');
//             }
//         });
//     }

//     /**
//      * Initialize tab buttons for metadata panel
//      */
//     function initializeTabButtons() {
//         if (!elements.tabButtons || elements.tabButtons.length === 0) return;

//         elements.tabButtons.forEach(button => {
//             button.addEventListener('click', function () {
//                 // Remove active class from all buttons and panes
//                 document.querySelectorAll('.metadata_tab-button').forEach(btn => {
//                     btn.classList.remove('active');
//                 });
//                 document.querySelectorAll('.metadata_tab-pane').forEach(pane => {
//                     pane.classList.remove('active');
//                 });

//                 // Add active class to clicked button
//                 this.classList.add('active');

//                 // Show corresponding tab pane
//                 const tabId = this.getAttribute('data-tab');
//                 const tabPane = document.getElementById(`${tabId}-tab`);
//                 if (tabPane) {
//                     tabPane.classList.add('active');
//                 } else {
//                     console.error(`Tab pane with ID ${tabId}-tab not found`);
//                 }
//             });
//         });
//     }

//     /**
//      * Initialize side panel button
//      */
//     function initializeSidePanelButton() {
//         if (!elements.sidePanelButton) {
//             console.error('Side panel button not found');
//             return;
//         }

//         elements.sidePanelButton.addEventListener('click', async () => {
//             console.log('Side panel button clicked');
//             try {
//                 const currentWindow = await chrome.windows.getCurrent();
//                 if (currentWindow) {
//                     await chrome.sidePanel.open({ windowId: currentWindow.id });
//                     console.log('Side panel opened');
//                 } else {
//                     console.error('Could not get current window');
//                 }
//             } catch (error) {
//                 console.error('Error opening side panel:', error);
//             }
//         });
//     }

//     /**
//      * Initialize clear button
//      */
//     function initializeClearButton() {
//         if (!elements.clearButton || !window.metadataBuffer) return;

//         elements.clearButton.addEventListener('click', function () {
//             if (confirm('Are you sure you want to clear all metadata?')) {
//                 window.metadataBuffer.clear();
//             }
//         });
//     }

//     /**
//  * Extract filename from URL
//  * @param {string} url - URL to extract from
//  * @returns {string} Filename
//  */
//     function extractFilenameFromUrl(url) {
//         try {
//             const urlObj = new URL(url);
//             return urlObj.pathname.split('/').pop() || "unknown";
//         } catch (e) {
//             console.error("Error extracting filename:", e);
//             return "unknown";
//         }
//     }

//     /**
//      * Create custom loader to capture response headers
//      * @param {object} Hls - HLS.js instance
//      * @returns {class} Custom loader class
//      */
//     function createCustomLoader(Hls) {
//         const XhrLoader = Hls.DefaultConfig.loader;

//         class HeaderCaptureLoader extends XhrLoader {
//             constructor(config) {
//                 super(config);
//                 const load = this.load.bind(this);

//                 this.load = function (context, config, callbacks) {
//                     // Store original callbacks
//                     const originalOnSuccess = callbacks.onSuccess;

//                     // Override success callback to capture headers
//                     callbacks.onSuccess = function (response, stats, context, xhr) {
//                         if (xhr && xhr.getAllResponseHeaders) {
//                             try {
//                                 const headerString = xhr.getAllResponseHeaders();
//                                 const headers = parseHeaderString(headerString);

//                                 // Add status and URL information
//                                 headers['status'] = xhr.status;
//                                 headers['statusText'] = xhr.statusText;
//                                 headers['responseURL'] = xhr.responseURL || context.url;

//                                 // Extract segment ID from URL
//                                 const filename = extractFilenameFromUrl(context.url);
//                                 const segmentId = extractSegmentIdFromUrl(context.url);

//                                 if (window.storeSegmentHeaders) {
//                                     // Store using both segment ID and filename for redundancy
//                                     if (segmentId) {
//                                         console.log("Storing headers for segment ID:", segmentId);
//                                         window.storeSegmentHeaders(segmentId, headers);
//                                     }

//                                     if (filename) {
//                                         console.log("Storing headers for filename:", filename);
//                                         window.storeSegmentHeaders(filename, headers);
//                                     }

//                                     // Add a specific entry for just the filename that will be displayed
//                                     if (window.addMetadataEntry && filename) {
//                                         window.addMetadataEntry(filename, false, false);
//                                     }
//                                 }
//                             } catch (e) {
//                                 console.error("Error processing headers:", e);
//                             }
//                         }

//                         // Call original callback
//                         originalOnSuccess(response, stats, context, xhr);
//                     };

//                     // Call the original load method
//                     load(context, config, callbacks);
//                 };
//             }
//         }

//         return HeaderCaptureLoader;
//     }

//     /**
//      * Parse header string into object
//      * @param {string} headerString - Raw header string
//      * @returns {object} Parsed headers object
//      */
//     function parseHeaderString(headerString) {
//         const headers = {};

//         if (!headerString) return headers;

//         headerString.split('\r\n').forEach(line => {
//             if (!line) return;

//             const parts = line.split(': ');
//             const key = parts.shift();
//             const value = parts.join(': ');

//             if (key) headers[key] = value;
//         });

//         return headers;
//     }

//     /**
//      * Extract segment ID from URL
//      * @param {string} url - URL to extract from
//      * @returns {string} Segment ID
//      */
//     function extractSegmentIdFromUrl(url) {
//         // First try to match a segment number directly in the file name
//         // This looks for patterns like segment-123.ts, media-123.ts, or seq-123.ts
//         let match = url.match(/(?:segment|media|seq|chunk)-?(\d+)\./i);
//         if (match && match[1]) {
//             return match[1];
//         }

//         // Try to find a number followed by .ts
//         match = url.match(/(\d+)\.ts/i);
//         if (match && match[1]) {
//             return match[1];
//         }

//         // If we can't extract an ID, use the full filename
//         const filename = extractFilenameFromUrl(url);
//         if (filename && (filename.endsWith('.ts') || filename.endsWith('.m3u8'))) {
//             return filename;
//         }

//         // Generate a fallback ID
//         return 'unknown-' + Date.now();
//     }



//     /**
//      * Initialize HLS player
//      */
//     function initializeHlsPlayer() {
//         if (Hls.isSupported()) {
//             console.log("HLS.js is supported. Initializing...");
//             const hls = new Hls({
//                 debug: false,
//                 loader: createCustomLoader(Hls)
//             });

//             try {
//                 // Load the source URL
//                 hls.loadSource(decodeURIComponent(m3u8Src));

//                 // Bind video element
//                 hls.attachMedia(elements.video);

//                 // Set up HLS event listeners
//                 setupHlsEventListeners(hls);
//             } catch (e) {
//                 console.error("Error initializing HLS player:", e);
//                 handlePlayerError("Failed to initialize HLS player: " + e.message);
//             }
//         } else if (elements.video.canPlayType('application/vnd.apple.mpegurl')) {
//             // Fallback for browsers with native HLS support
//             console.log("HLS.js not supported, but native HLS playback might work.");
//             useNativeHlsPlayback();
//         } else {
//             // No HLS support at all
//             console.error("HLS is not supported in this browser.");
//             handleNoHlsSupport();
//         }
//     }

//     /**
//      * Use native HLS playback
//      */
//     function useNativeHlsPlayback() {
//         if (window.addMetadataEntry) {
//             addMetadataEntry("HLS.js not supported, using native HLS playback", false, true);
//         }

//         elements.video.src = decodeURIComponent(m3u8Src);
//         elements.video.addEventListener('loadedmetadata', function () {
//             elements.video.play().catch(e => console.warn("Autoplay failed:", e));
//             if (window.addMetadataEntry) {
//                 addMetadataEntry("Video metadata loaded, playback started");
//             }
//         });

//         chrome.runtime.sendMessage({
//             type: "NATIVE_HLS_PLAYBACK",
//             payload: { url: decodeURIComponent(m3u8Src) }
//         }).catch(e => console.warn("Failed to send native playback info to side panel:", e));
//     }

//     /**
//      * Handle no HLS support
//      */
//     function handleNoHlsSupport() {
//         if (window.addMetadataEntry) {
//             addMetadataEntry("HLS is not supported in this browser", true, true);
//         }

//         document.body.innerHTML = '<p style="color: red; text-align: center; margin-top: 50px;">Error: HLS playback is not supported in your browser.</p>';

//         chrome.runtime.sendMessage({
//             type: "HLS_NOT_SUPPORTED",
//             payload: { url: decodeURIComponent(m3u8Src) }
//         }).catch(e => console.warn("Failed to send HLS not supported info to side panel:", e));
//     }

//     /**
//      * Handle player error
//      * @param {string} message - Error message
//      */
//     function handlePlayerError(message) {
//         if (window.addMetadataEntry) {
//             addMetadataEntry(message, true, true);
//         }
//         updateStatusBar("Error: " + message);
//     }

//     /**
//      * Display headers in panel
//      * @param {string} segmentId - Segment ID
//      */
//     function displayHeaders(segmentId) {
//         if (!elements.headerContent) return;

//         if (window.segmentHeaders && window.segmentHeaders.has(segmentId)) {
//             const headers = window.segmentHeaders.get(segmentId);
//             elements.headerContent.textContent = typeof headers === 'object' ?
//                 JSON.stringify(headers, null, 2) : headers;
//         } else {
//             elements.headerContent.textContent = "No header data available for this segment";
//         }
//     }

//     /**
//      * Display response body
//      * @param {string} segmentId - Segment ID
//      */
//     function displayResponseBody(segmentId) {
//         if (!elements.bodyContent) return;

//         if (window.segmentBodies && window.segmentBodies.has(segmentId)) {
//             const body = window.segmentBodies.get(segmentId);
//             elements.bodyContent.textContent = typeof body === 'string' ?
//                 body : JSON.stringify(body, null, 2);
//         } else {
//             elements.bodyContent.textContent = "No response body available for this segment";
//         }
//     }

//     /**
//      * Set up HLS event listeners
//      * @param {object} hls - HLS.js instance
//      */
//     function setupHlsEventListeners(hls) {
//         // Manifest parsed event
//         hls.on(Hls.Events.MANIFEST_PARSED, function (event, data) {
//             handleManifestParsed(hls, data);
//         });

//         // Level switched event
//         hls.on(Hls.Events.LEVEL_SWITCHED, function (event, data) {
//             handleLevelSwitched(hls, data);
//         });

//         // Fragment loading event
//         hls.on(Hls.Events.FRAG_LOADING, function (event, data) {
//             handleFragmentLoading(data);
//         });

//         // Fragment loaded event
//         hls.on(Hls.Events.FRAG_LOADED, function (event, data) {
//             handleFragmentLoaded(data);
//         });

//         // Error event
//         hls.on(Hls.Events.ERROR, function (event, data) {
//             handleHlsError(hls, data);
//         });
//     }

//     /**
//      * Handle manifest parsed event
//      * @param {object} hls - HLS.js instance
//      * @param {object} data - Event data
//      */
//     function handleManifestParsed(hls, data) {
//         console.log("Manifest parsed, levels available:", data.levels);

//         // Start playback
//         elements.video.play().catch(e => console.warn("Autoplay failed:", e));

//         // Update status bar with quality info
//         if (window.updatePlayerStatus) {
//             const qualities = data.levels.map(l => `${l.height}p`).join(', ');
//             window.updatePlayerStatus(`Available qualities: ${qualities}`);
//         }

//         // Log to metadata panel
//         if (window.addMetadataEntry) {
//             addMetadataEntry(`Manifest parsed: ${data.levels.length} quality levels available`, false, true);
//             data.levels.forEach(level => {
//                 const bitrate = level.bitrate ? `${Math.round(level.bitrate / 1000)} kbps` : 'Unknown';
//                 const resolution = level.width && level.height ? `${level.width}x${level.height}` : 'Unknown';
//                 addMetadataEntry(`Quality level: ${resolution} @ ${bitrate}`);
//             });
//         }

//         // Add m3u8 filename to metadata panel
//         const m3u8Filename = extractFilenameFromUrl(decodeURIComponent(m3u8Src));
//         if (window.addMetadataEntry && m3u8Filename) {
//             addMetadataEntry(m3u8Filename, false, true);
//         }

//         // Try to fetch and display the manifest content
//         if (window.fetchMetadata) {
//             fetchMetadata(decodeURIComponent(m3u8Src));
//         }

//         // Send data to side panel
//         chrome.runtime.sendMessage({
//             type: "HLS_MANIFEST_DATA",
//             payload: {
//                 url: decodeURIComponent(m3u8Src),
//                 levels: data.levels.map(l => ({ height: l.height, bitrate: l.bitrate })),
//             }
//         }).catch(e => console.warn("Failed to send manifest data to side panel:", e));
//     }

//     /**
//      * Handle level switched event
//      * @param {object} hls - HLS.js instance
//      * @param {object} data - Event data
//      */
//     function handleLevelSwitched(hls, data) {
//         if (!hls.levels || !hls.levels[data.level]) return;

//         const currentLevel = hls.levels[data.level];
//         console.log('Switched to level:', currentLevel);

//         // Update status bar
//         if (window.updatePlayerStatus) {
//             window.updatePlayerStatus(`Playing: ${currentLevel.height}p @ ${Math.round(currentLevel.bitrate / 1000)} kbps`);
//         }

//         // Log to metadata panel
//         if (window.addMetadataEntry) {
//             const resolution = currentLevel.width && currentLevel.height ? `${currentLevel.width}x${currentLevel.height}` : 'Unknown';
//             const bitrate = currentLevel.bitrate ? `${Math.round(currentLevel.bitrate / 1000)} kbps` : 'Unknown';
//             addMetadataEntry(`Quality switched to: ${resolution} @ ${bitrate}`);
//         }

//         // Send data to side panel
//         chrome.runtime.sendMessage({
//             type: "HLS_LEVEL_SWITCH",
//             payload: {
//                 height: currentLevel.height,
//                 bitrate: currentLevel.bitrate
//             }
//         }).catch(e => console.warn("Failed to send level switch data to side panel:", e));
//     }

//     /**
//      * Handle fragment loading event
//      * @param {object} data - Event data
//      */
//     function handleFragmentLoading(data) {
//         if (!window.addMetadataEntry) return;

//         // Extract the segment name from the URL
//         let segmentName = extractFilenameFromUrl(data.frag.url);

//         // IMPORTANT: We add just the filename to be shown in the metadata panel
//         if (segmentName.endsWith('.ts') || segmentName.endsWith('.m3u8')) {
//             addMetadataEntry(segmentName, false, false);
//         }

//         // Attach a progress listener to the XHR to capture headers when loaded
//         try {
//             if (data.frag.loader && data.frag.loader.xhr) {
//                 const xhr = data.frag.loader.xhr;
//                 xhr.addEventListener('load', function () {
//                     if (xhr.readyState === 4 && xhr.status >= 200 && xhr.status < 300) {
//                         const segmentId = extractSegmentIdFromUrl(data.frag.url);
//                         captureXhrHeaders(xhr, segmentId, data.frag.url);
//                         captureResponseBody(xhr, data.frag.url, segmentId);
//                     }
//                 });
//             }
//         } catch (e) {
//             console.error("Error setting up XHR listener:", e);
//         }
//     }

//     /**
//      * Capture XHR headers
//      * @param {XMLHttpRequest} xhr - XHR object
//      * @param {string} segmentId - Segment ID
//      * @param {string} url - URL
//      */
//     function captureXhrHeaders(xhr, segmentId, url) {
//         try {
//             // Create headers object
//             const headers = {
//                 "status": xhr.status,
//                 "statusText": xhr.statusText,
//                 "responseURL": xhr.responseURL || url
//             };

//             // Get all headers
//             const headersText = xhr.getAllResponseHeaders();

//             if (headersText) {
//                 const headerLines = headersText.split('\r\n');
//                 headerLines.forEach(line => {
//                     if (!line) return;

//                     const parts = line.split(':');
//                     if (parts.length >= 2) {
//                         const key = parts[0].trim();
//                         const value = parts.slice(1).join(':').trim();
//                         headers[key] = value;
//                     }
//                 });
//             }

//             // Store headers with segment ID
//             if (window.storeSegmentHeaders) {
//                 console.log("Storing headers for segment:", segmentId);
//                 window.storeSegmentHeaders(segmentId, headers);
//             }
//         } catch (e) {
//             console.error("Error parsing headers:", e);
//         }
//     }

//     /**
//      * Handle fragment loaded event
//      * @param {object} data - Event data
//      */
//     function handleFragmentLoaded(data) {
//         if (!window.addMetadataEntry) return;

//         // Extract the segment name from the URL and add it to metadata
//         let segmentName = extractFilenameFromUrl(data.frag.url);

//         // IMPORTANT: Add the TS filename to the metadata panel
//         if (segmentName.endsWith('.ts') || segmentName.endsWith('.m3u8')) {
//             addMetadataEntry(segmentName, false, false);
//         }

//         // Capture headers as backup method
//         captureFragmentData(data);
//     }

//     /**
//      * Capture fragment data (headers and body)
//      * @param {object} data - Fragment data
//      */
//     function captureFragmentData(data) {
//         try {
//             if (!data.frag.loader || !data.frag.loader.xhr) return;

//             const xhr = data.frag.loader.xhr;
//             const segmentId = data.frag.sn;
//             const url = data.frag.url;

//             // Capture headers
//             captureXhrHeaders(xhr, segmentId, url);

//             // Capture response body
//             captureResponseBody(xhr, url, segmentId);

//         } catch (e) {
//             console.error("Error capturing fragment data:", e);

//             // Fallback to stats data for headers
//             const size = Math.round(data.stats.total / 1024);
//             const statsHeaders = {
//                 "NOTE": "Response headers not available - showing statistics instead",
//                 "Load Time (ms)": data.stats.tload - data.stats.trequest,
//                 "Size (KB)": size,
//                 "URL": data.frag.url,
//                 "Segment Number": data.frag.sn,
//                 "First Byte Time (ms)": data.stats.tfirst - data.stats.trequest,
//                 "Request Time": new Date(data.stats.trequest).toISOString()
//             };

//             if (window.storeSegmentHeaders) {
//                 window.storeSegmentHeaders(data.frag.sn, statsHeaders);
//             }
//         }
//     }

//     /**
//      * Capture response body
//      * @param {XMLHttpRequest} xhr - XHR object
//      * @param {string} url - URL
//      * @param {string} segmentId - Segment ID
//      */
//     function captureResponseBody(xhr, url, segmentId) {
//         try {
//             let responseBody = "No body content available";

//             if (xhr.response) {
//                 // For TS segments, show a hex dump
//                 if (url.toLowerCase().endsWith('.ts')) {
//                     const view = new Uint8Array(xhr.response);
//                     responseBody = `Binary TS segment: ${view.length} bytes`;
//                     responseBody += "\n\nFirst 32 bytes (hex):\n";

//                     for (let i = 0; i < Math.min(32, view.length); i++) {
//                         responseBody += view[i].toString(16).padStart(2, '0') + " ";
//                         if ((i + 1) % 16 === 0) responseBody += "\n";
//                     }
//                 }
//                 // For m3u8, show the text content
//                 else if (url.toLowerCase().includes('.m3u8')) {
//                     responseBody = xhr.responseText || "No text content";
//                 }
//             }

//             // Store body with segment ID
//             if (window.storeSegmentBody) {
//                 console.log("Storing body for segment:", segmentId);
//                 window.storeSegmentBody(segmentId, responseBody);
//             }
//         } catch (e) {
//             console.error("Error capturing response body:", e);
//         }
//     }

//     /**
//      * Handle HLS error
//      * @param {object} hls - HLS.js instance
//      * @param {object} data - Error data
//      */
//     function handleHlsError(hls, data) {
//         console.error('HLS Error:', data);

//         // Update status bar
//         if (window.updatePlayerStatus) {
//             window.updatePlayerStatus(`Error: ${data.details}`);
//         }

//         // Log to metadata panel
//         if (window.addMetadataEntry) {
//             let errorMsg = `Error: Type=${data.type}, Details=${data.details}`;
//             if (data.url) {
//                 errorMsg += `, URL=${data.url}`;
//             }
//             addMetadataEntry(errorMsg, true);
//         }

//         // Send data to side panel
//         chrome.runtime.sendMessage({
//             type: "HLS_ERROR",
//             payload: {
//                 type: data.type,
//                 details: data.details,
//                 fatal: data.fatal,
//                 url: data.url
//             }
//         }).catch(e => console.warn("Failed to send error data to side panel:", e));

//         // Handle fatal errors
//         if (data.fatal) {
//             handleFatalHlsError(hls, data);
//         }
//     }

//     /**
//      * Handle fatal HLS error
//      * @param {object} hls - HLS.js instance
//      * @param {object} data - Error data
//      */
//     function handleFatalHlsError(hls, data) {
//         switch (data.type) {
//             case Hls.ErrorTypes.NETWORK_ERROR:
//                 console.error('Fatal network error encountered, trying to recover...');
//                 if (window.addMetadataEntry) {
//                     addMetadataEntry('Fatal network error encountered, trying to recover...', true);
//                 }
//                 hls.startLoad();
//                 break;

//             case Hls.ErrorTypes.MEDIA_ERROR:
//                 console.error('Fatal media error encountered, trying to recover...');
//                 if (window.addMetadataEntry) {
//                     addMetadataEntry('Fatal media error encountered, trying to recover...', true);
//                 }
//                 hls.recoverMediaError();
//                 break;

//             default:
//                 // Cannot recover
//                 console.error('Unrecoverable fatal HLS error.');
//                 if (window.addMetadataEntry) {
//                     addMetadataEntry('Unrecoverable fatal HLS error.', true);
//                 }
//                 hls.destroy();
//                 break;
//         }
//     }


//     if (metadataList) {
//         metadataList.addEventListener('click', function (e) {
//             const clickedItem = e.target.closest('div');
//             if (!clickedItem) return;

//             // Clear selection from all items
//             document.querySelectorAll('#metadataList div').forEach(div => {
//                 div.classList.remove('selected');
//                 div.style.backgroundColor = '';
//             });

//             // Select this item
//             clickedItem.classList.add('selected');
//             clickedItem.style.backgroundColor = '#1a3c5f';

//             // Get the text content (excluding timestamp)
//             let fullText = clickedItem.textContent.trim();
//             const timestampMatch = fullText.match(/^\[\d{1,2}:\d{2}:\d{2}(?: [AP]M)?\]\s*(.*)/);
//             let segmentName = timestampMatch ? timestampMatch[1].trim() : fullText.trim();

//             console.log("Selected item:", segmentName);

//             // Simple segment ID extraction - just try to find a number before .ts
//             let segmentId = null;
//             const match = segmentName.match(/(\d+)\.ts$/);
//             if (match && match[1]) {
//                 segmentId = match[1];
//                 console.log("Extracted segment ID:", segmentId);
//             }

//             // Get header content element
//             const headerContent = document.getElementById('headerContent');

//             if (headerContent) {
//                 try {
//                     // First try with the extracted segment ID
//                     if (segmentId && window.segmentHeaders && window.segmentHeaders.has(segmentId)) {
//                         const headers = window.segmentHeaders.get(segmentId);
//                         headerContent.textContent = JSON.stringify(headers, null, 2);
//                         console.log("Found headers using segment ID:", segmentId);
//                     }
//                     // If that fails, try looking through all headers for a filename match
//                     else {
//                         let headerFound = false;

//                         if (window.segmentHeaders) {
//                             // Log for debugging
//                             console.log("Available keys in segmentHeaders:",
//                                 [...window.segmentHeaders.keys()]);

//                             // Try to find any header that matches this segment name
//                             for (const [id, headers] of window.segmentHeaders.entries()) {
//                                 // If we have response URL and it contains our segment name
//                                 if (headers && headers.responseURL &&
//                                     headers.responseURL.includes(segmentName)) {

//                                     headerContent.textContent = JSON.stringify(headers, null, 2);
//                                     console.log("Found headers by URL match:", id);
//                                     headerFound = true;
//                                     break;
//                                 }
//                             }
//                         }

//                         if (!headerFound) {
//                             headerContent.textContent = "No header data found for: " + segmentName;
//                         }
//                     }
//                 } catch (err) {
//                     console.error("Error displaying headers:", err);
//                     headerContent.textContent = "Error displaying headers: " + err.message;
//                 }
//             }
//         });
//     }


//     // Add this function at the end of player.js
//     window.checkSegmentMatching = function (segmentName) {
//         console.log("Checking segment matching for:", segmentName);

//         if (!window.segmentHeaders) {
//             console.error("segmentHeaders map doesn't exist!");
//             return "ERROR: segmentHeaders map doesn't exist";
//         }

//         // Log all keys in the map
//         const keys = [...window.segmentHeaders.keys()];
//         console.log("All keys in segmentHeaders:", keys);

//         // Check if the exact segment name exists
//         const hasExact = window.segmentHeaders.has(segmentName);
//         console.log("Has exact match:", hasExact);

//         // Check for partial matches
//         const partialMatches = keys.filter(key => key.includes(segmentName) || segmentName.includes(key));
//         console.log("Partial matches:", partialMatches);

//         return {
//             exactMatch: hasExact,
//             partialMatches: partialMatches,
//             allKeys: keys
//         };
//     };

//     function waitForMetadataReady(callback) {
//         if (
//             window.segmentHeaders &&
//             typeof window.displayHeaders === 'function' &&
//             typeof window.addMetadataEntry === 'function'
//         ) {
//             callback();
//         } else {
//             setTimeout(() => waitForMetadataReady(callback), 100);
//         }
//     }
    
//     document.addEventListener('DOMContentLoaded', () => {
//         waitForMetadataReady(() => {
//             console.log(" Metadata system ready — initializing HLS player page.");
//             initializePlayerPage(); // Run everything from here
//         });
//     });
    

//     // Also expose it globally for manual triggering if needed
//     window.fixHeaderDisplay = fixHeaderDisplay;

//     // Tab and content display fix
//     function fixTabDisplay() {
//         console.log("Applying tab display fix");

//         // First, make sure the "Response Headers" tab is active
//         const headerTabButton = document.querySelector('.metadata_tab-button[data-tab="headers"]');
//         if (headerTabButton) {
//             // Remove active class from all buttons and panes
//             document.querySelectorAll('.metadata_tab-button').forEach(btn => {
//                 btn.classList.remove('active');
//             });
//             document.querySelectorAll('.metadata_tab-pane').forEach(pane => {
//                 pane.classList.remove('active');
//             });

//             // Activate the headers tab
//             headerTabButton.classList.add('active');

//             // Activate the corresponding pane
//             const headerPane = document.getElementById('headers-tab');
//             if (headerPane) {
//                 headerPane.classList.add('active');
//                 console.log("Headers tab activated");
//             } else {
//                 console.error("Headers tab pane not found!");
//             }
//         } else {
//             console.error("Headers tab button not found!");
//         }

//         // Fix click handlers for tab buttons
//         document.querySelectorAll('.metadata_tab-button').forEach(button => {
//             // Remove existing handlers by cloning
//             const newButton = button.cloneNode(true);
//             button.parentNode.replaceChild(newButton, button);

//             // Add new click handler
//             newButton.addEventListener('click', function () {
//                 // Get tab ID
//                 const tabId = this.getAttribute('data-tab');
//                 console.log("Tab clicked:", tabId);

//                 // Remove active class from all buttons and panes
//                 document.querySelectorAll('.metadata_tab-button').forEach(btn => {
//                     btn.classList.remove('active');
//                 });
//                 document.querySelectorAll('.metadata_tab-pane').forEach(pane => {
//                     pane.classList.remove('active');
//                 });

//                 // Add active class to this button
//                 this.classList.add('active');

//                 // Add active class to corresponding pane
//                 const tabPane = document.getElementById(`${tabId}-tab`);
//                 if (tabPane) {
//                     tabPane.classList.add('active');
//                     console.log("Tab pane activated:", tabId);
//                 } else {
//                     console.error(`Tab pane not found: ${tabId}-tab`);
//                 }
//             });
//         });

//         // Apply a click handler that first selects the right tab
//         const metadataList = document.getElementById('metadataList');
//         if (metadataList) {
//             // Clear existing handlers
//             const newList = metadataList.cloneNode(true);
//             metadataList.parentNode.replaceChild(newList, metadataList);

//             // Add new click handler
//             newList.addEventListener('click', function (e) {
//                 const clickedItem = e.target.closest('div');
//                 if (!clickedItem) return;

//                 // Clear selection from all items
//                 document.querySelectorAll('#metadataList div').forEach(div => {
//                     div.classList.remove('selected');
//                     div.style.backgroundColor = '';
//                 });

//                 // Select this item
//                 clickedItem.classList.add('selected');
//                 clickedItem.style.backgroundColor = '#1a3c5f';

//                 // Extract segment ID
//                 let fullText = clickedItem.textContent.trim();
//                 const timestampMatch = fullText.match(/^\[\d{1,2}:\d{2}:\d{2}(?: [AP]M)?\]\s*(.*)/);
//                 let segmentName = timestampMatch ? timestampMatch[1].trim() : fullText.trim();
//                 console.log("Selected item:", segmentName);

//                 // Extract segment ID
//                 const match = segmentName.match(/(\d+)\.ts$/);
//                 if (match && match[1]) {
//                     const segmentId = match[1];
//                     console.log("Extracted segment ID:", segmentId);

//                     // Make sure the headers tab is active
//                     const headerTabButton = document.querySelector('.metadata_tab-button[data-tab="headers"]');
//                     if (headerTabButton) {
//                         // Simulate a click on the headers tab
//                         headerTabButton.click();

//                         // Get the headers content element
//                         const headerContent = document.getElementById('headerContent');
//                         if (headerContent && window.segmentHeaders && window.segmentHeaders.has(segmentId)) {
//                             const headers = window.segmentHeaders.get(segmentId);
//                             console.log("Found headers using segment ID:", segmentId);

//                             // Set the headers content
//                             headerContent.innerText = JSON.stringify(headers, null, 2);
//                             console.log("Header content set");

//                             // Force a redraw
//                             headerContent.style.display = 'none';
//                             setTimeout(() => {
//                                 headerContent.style.display = 'block';
//                             }, 10);
//                         } else {
//                             console.error("Header content element or headers not found");
//                         }
//                     }
//                 }
//             });
//         }

//         console.log("Tab display fix applied");
//     }

//     // Call the fix function after a short delay
//     setTimeout(fixTabDisplay, 500);

//     // Also make it available globally
//     window.fixTabDisplay = fixTabDisplay;
// });