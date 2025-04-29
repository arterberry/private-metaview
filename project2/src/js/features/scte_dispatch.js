// js/features/scte_dispatch.js

(function() {
    // Configuration
    const config = {
        windowSize: 10, // Number of directives to consider "adjacent"
        patterns: {
            contentBoundary: ['discontinuity-sequence', 'media-sequence', 'time-offset']
        }
    };

    // State
    const state = {
        directives: [], // Recent directives for pattern matching
        values: {}, // Store actual values of tags
        initialized: false
    };

    // Public API
    window.SCTEDispatcher = {
        init: initialize,
        processTag: processHLSTag,
        // Can add more public methods as needed
    };

    // Initialize module and attach listeners
    function initialize() {
        if (state.initialized) return;
        
        // Listen for manifest parse events from hls_parser.js
        document.addEventListener('hlsPlaylistParsed', handlePlaylistParsed);
        
        // Reset state when a new stream loads
        document.addEventListener('newStreamLoading', resetState);
        
        state.initialized = true;
        console.log('[scte_dispatch] Initialized and listening for HLS events');
    }

    function resetState() {
        state.directives = [];
        state.values = {};
        console.log('[scte_dispatch] State reset');
    }

    // Process entire playlists when parsed
    function handlePlaylistParsed(event) {
        if (event.detail.type !== 'media') return; // Only care about media playlists
        
        const content = event.detail.content;
        if (!content) return;
        
        // Process each line
        const lines = content.split('\n');
        lines.forEach(line => processHLSTag(line.trim()));
    }

    // Process individual HLS tags (can be called by hls_parser.js directly)
    function processHLSTag(line) {
        if (!line) return;
        
        if (line.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE:')) {
            const value = parseInt(line.split(':')[1], 10);
            addDirective('discontinuity-sequence', value);
        }
        else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
            const value = parseInt(line.split(':')[1], 10);
            addDirective('media-sequence', value);
        }
        else if (line.startsWith('#EXT-X-START:')) {
            const timeOffsetMatch = line.match(/TIME-OFFSET=([\d.-]+)/);
            if (timeOffsetMatch) {
                const value = parseFloat(timeOffsetMatch[1]);
                addDirective('time-offset', value);
            }
        }
        // Can add more tag detections here
    }

    // Add directive to window and check patterns
    function addDirective(directiveType, value) {
        // Update state
        state.directives.push(directiveType);
        state.values[directiveType] = value;
        
        // Maintain limited window size
        if (state.directives.length > config.windowSize) {
            state.directives.shift();
        }
        
        // Check for patterns
        checkPatterns();
    }

    // Check if any patterns are matched
    function checkPatterns() {
        // Check content boundary pattern
        const contentBoundaryPattern = config.patterns.contentBoundary;
        if (patternMatched(contentBoundaryPattern)) {
            // Extract values for the matched pattern
            const patternData = {
                discontinuitySequence: state.values['discontinuity-sequence'],
                mediaSequence: state.values['media-sequence'],
                timeOffset: state.values['time-offset']
            };
            
            // Dispatch event
            dispatchContentBoundary(patternData);
            
            // Reset pattern window to avoid duplicate triggers
            state.directives = [];
        }
    }

    // Helper to check if pattern is in the window (regardless of order)
    function patternMatched(pattern) {
        return pattern.every(directive => state.directives.includes(directive));
    }

    // Dispatch content boundary event
    function dispatchContentBoundary(patternData) {
        console.log('[scte_dispatch] Content boundary pattern detected:', patternData);
        
        document.dispatchEvent(new CustomEvent('hlsContentBoundaryDetected', { 
            detail: { 
                patternData,
                timestamp: Date.now(),
                source: 'pattern-detection'
            } 
        }));
    }
})();