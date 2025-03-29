// ai-analyzer.js - Platform Compatibility Analysis for VIDINFRA MetaView

/**
 * AI analysis module for HLS stream compatibility analysis
 * Uses data gathered from the player and manifest to determine platform compatibility
 */

// Main AI Analysis module
const aiAnalyzer = {
    // Configuration
    config: {
        maxDataCollectionTime: 240, // 4 minutes in seconds
        providers: {
            gemini: 'gemini',
            anthropic: 'anthropic'
        },
        defaultProvider: 'anthropic',
        endpoints: {
            gemini: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
            anthropic: 'https://api.anthropic.com/v1/messages'
        },
        models: {
            gemini: 'gemini-2.0-flash',
            anthropic: 'claude-3-haiku-20240307'
        },
        storageKeys: {
            apiKey: 'vidinfra_ai_key',
            provider: 'vidinfra_ai_provider'
        }
    },

    // Current state
    state: {
        analyzing: false,
        dataCollectionStartTime: null,
        collectedData: {
            manifestType: null,
            version: null,
            resolutionLadder: [],
            videoCodecs: [],
            audioTracks: [],
            drmSignals: {
                widevine: false,
                playready: false,
                fairplay: false
            },
            contentProtectionMethods: []
        },
        analysis: null
    },

    // Initialize the analyzer
    init: function () {
        console.log("Initializing AI Analyzer module...");
        this.setupEventListeners();
    },

    // Setup event listeners
    setupEventListeners: function () {
        const analyzeButton = document.getElementById('analyzeCompatibilityBtn');
        if (analyzeButton) {
            analyzeButton.addEventListener('click', () => this.handleAnalysisRequest());
        } else {
            console.error("AI Analyzer: Analyze button not found in DOM");
        }

        // Listen for video play event to begin data collection
        const videoElement = document.getElementById('videoPlayer');
        if (videoElement) {
            videoElement.addEventListener('playing', () => this.beginDataCollection());
        }
    },

    // Begin collecting data when a stream starts playing
    beginDataCollection: function () {
        console.log("AI Analyzer: Beginning data collection");
        // Reset collected data
        this.resetCollectedData();
        this.state.dataCollectionStartTime = Date.now();

        // Start collecting available data immediately
        this.collectInitialData();
    },

    // Reset collected data
    resetCollectedData: function () {
        this.state.collectedData = {
            manifestType: null,
            version: null,
            resolutionLadder: [],
            videoCodecs: [],
            audioTracks: [],
            drmSignals: {
                widevine: false,
                playready: false,
                fairplay: false
            },
            contentProtectionMethods: []
        };
        this.state.analysis = null;
    },

    // Collect initial data from the page
    collectInitialData: function () {
        // Get resolution ladder from the resolution list
        this.collectResolutionLadder();

        // Try to determine if this is a VOD or LIVE stream
        this.determineManifestType();

        // Check for HLS version
        this.determineHlsVersion();

        // Get available codec information
        this.collectCodecInformation();

        // Get audio track information
        this.collectAudioTracks();

        // Check for DRM signals
        this.checkForDrmSignals();

        console.log("AI Analyzer: Initial data collection complete", this.state.collectedData);
    },

    // Collect resolution ladder from the UI
    collectResolutionLadder: function () {
        const resolutionItems = document.querySelectorAll('.resolution-item');
        const resolutionLadder = [];

        resolutionItems.forEach(item => {
            const text = item.textContent;
            const resMatch = text.match(/Resolution: (\d+x\d+)/);
            if (resMatch && resMatch[1]) {
                resolutionLadder.push(resMatch[1]);
            }
        });

        if (resolutionLadder.length > 0) {
            this.state.collectedData.resolutionLadder = resolutionLadder;
        }
    },

    // Determine if this is a VOD or LIVE stream
    determineManifestType: function () {
        // Check for live indicators in the metadata panel
        const metadataItems = document.querySelectorAll('#metadataList div');
        let isLive = false;

        metadataItems.forEach(item => {
            const text = item.textContent.toLowerCase();
            if (text.includes('#ext-x-endlist')) {
                // EXT-X-ENDLIST indicates VOD
                this.state.collectedData.manifestType = "VOD";
                return;
            } else if (text.includes('#ext-x-program-date-time') ||
                text.includes('#ext-x-targetduration') ||
                text.includes('live') ||
                text.includes('realtime')) {
                isLive = true;
            }
        });

        if (isLive && !this.state.collectedData.manifestType) {
            this.state.collectedData.manifestType = "LIVE";
        } else if (!this.state.collectedData.manifestType) {
            // Default to VOD if we can't determine
            this.state.collectedData.manifestType = "VOD";
        }
    },

    // Determine HLS version
    determineHlsVersion: function () {
        // Look for version tag in metadata
        const metadataItems = document.querySelectorAll('#metadataList div');
        let version = null;

        metadataItems.forEach(item => {
            const text = item.textContent;
            const versionMatch = text.match(/#EXT-X-VERSION:(\d+)/);
            if (versionMatch && versionMatch[1]) {
                version = parseInt(versionMatch[1]);
            }
        });

        if (version !== null) {
            this.state.collectedData.version = version;
        }
    },

    // Collect codec information
    collectCodecInformation: function () {
        const metadataItems = document.querySelectorAll('#metadataList div');
        const videoCodecs = new Set();

        metadataItems.forEach(item => {
            const text = item.textContent;
            // Look for codec information in CODECS attribute
            const codecMatch = text.match(/CODECS="([^"]+)"/);
            if (codecMatch && codecMatch[1]) {
                const codecs = codecMatch[1].split(',').map(c => c.trim());
                codecs.forEach(codec => {
                    // Only add video codecs (usually start with avc, hvc, hev, or vp)
                    if (codec.startsWith('avc') ||
                        codec.startsWith('hvc') ||
                        codec.startsWith('hev') ||
                        codec.startsWith('vp')) {
                        videoCodecs.add(codec);
                    }
                });
            }
        });

        if (videoCodecs.size > 0) {
            this.state.collectedData.videoCodecs = Array.from(videoCodecs);
        }
    },

    // Collect audio track information
    collectAudioTracks: function () {
        // Check if QoE data contains audio track info
        if (window.qoeModule && window.qoeModule.qoeData && window.qoeModule.qoeData.audioTracks) {
            this.state.collectedData.audioTracks = [...window.qoeModule.qoeData.audioTracks];
            return;
        }

        // Fallback: try to extract from metadata
        const audioTracks = [];
        const metadataItems = document.querySelectorAll('#metadataList div');

        metadataItems.forEach(item => {
            const text = item.textContent;
            if (text.includes('EXT-X-MEDIA') && text.includes('TYPE=AUDIO')) {
                const langMatch = text.match(/LANGUAGE="([^"]+)"/);
                const nameMatch = text.match(/NAME="([^"]+)"/);
                const defaultMatch = text.match(/DEFAULT=(YES|NO)/);
                const codecMatch = text.match(/CODECS="([^"]+)"/);

                if (langMatch || nameMatch) {
                    const track = {
                        language: langMatch ? langMatch[1] : 'unknown',
                        name: nameMatch ? nameMatch[1] : '',
                        default: defaultMatch ? defaultMatch[1] === 'YES' : false,
                        codec: codecMatch ? codecMatch[1] : ''
                    };
                    audioTracks.push(track);
                }
            }
        });

        if (audioTracks.length > 0) {
            this.state.collectedData.audioTracks = audioTracks;
        }
    },

    // Check for DRM signals
    checkForDrmSignals: function () {
        const metadataItems = document.querySelectorAll('#metadataList div');
        let contentProtectionMethods = new Set();

        metadataItems.forEach(item => {
            const text = item.textContent.toLowerCase();

            // Check for DRM signals
            if (text.includes('widevine') || text.includes('urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed')) {
                this.state.collectedData.drmSignals.widevine = true;
            }
            if (text.includes('playready') || text.includes('urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95')) {
                this.state.collectedData.drmSignals.playready = true;
            }
            if (text.includes('fairplay') || text.includes('com.apple.streamingkeydelivery')) {
                this.state.collectedData.drmSignals.fairplay = true;
            }

            // Check for encryption methods
            if (text.includes('sample-aes')) {
                contentProtectionMethods.add('SAMPLE-AES');
            }
            if (text.includes('cenc')) {
                contentProtectionMethods.add('CENC');
            }
            if (text.includes('cbcs')) {
                contentProtectionMethods.add('CBCS');
            }
        });

        if (contentProtectionMethods.size > 0) {
            this.state.collectedData.contentProtectionMethods = Array.from(contentProtectionMethods);
        }
    },

    // Handle the analysis button click
    handleAnalysisRequest: function () {
        if (this.state.analyzing) {
            console.log("Analysis already in progress");
            return;
        }

        // Check if we have collected data
        if (!this.hasCollectedData()) {
            this.displayAnalysisError("No stream data collected. Please play a stream first.");
            return;
        }

        // Check if we have collected data for less than 4 minutes
        if (this.state.dataCollectionStartTime) {
            const collectionTime = (Date.now() - this.state.dataCollectionStartTime) / 1000;
            if (collectionTime > this.config.maxDataCollectionTime) {
                console.log(`Data collection time (${collectionTime}s) exceeds max (${this.config.maxDataCollectionTime}s). Truncating data.`);
                // We could add data truncation here if needed
            }
        }

        // Start analysis
        this.startAnalysis();
    },

    // Check if we have collected enough data
    hasCollectedData: function () {
        return this.state.collectedData.resolutionLadder.length > 0 ||
            this.state.collectedData.videoCodecs.length > 0;
    },

    // Start the analysis process
    startAnalysis: function () {
        this.state.analyzing = true;
        this.updateAnalysisStatus("Analyzing stream compatibility...");

        // Get API key from storage
        this.getApiKey()
            .then(apiKey => {
                if (!apiKey) {
                    throw new Error("No API key found. Please add your API key in Admin settings.");
                }

                // Get provider from storage (default to anthropic)
                return this.getProvider().then(provider => ({ apiKey, provider }));
            })
            .then(({ apiKey, provider }) => {
                console.log(`Using ${provider} provider for analysis`);

                // Build prompt and send to LLM
                return this.analyzePlatformCompatibility(provider, apiKey, this.state.collectedData);
            })
            .then(analysis => {
                this.state.analysis = analysis;
                this.displayAnalysisResult(analysis);
                this.state.analyzing = false;
            })
            .catch(error => {
                console.error("Analysis error:", error);
                this.displayAnalysisError(error.message);
                this.state.analyzing = false;
            });
    },

    // Get API key from storage
    getApiKey: function () {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.local.get([this.config.storageKeys.apiKey], function (result) {
                    resolve(result[aiAnalyzer.config.storageKeys.apiKey]);
                });
            } catch (error) {
                console.error("Error getting API key from storage:", error);
                reject(error);
            }
        });
    },

    // Get provider from storage
    getProvider: function () {
        return new Promise((resolve, reject) => {
            try {
                chrome.storage.local.get([this.config.storageKeys.provider], function (result) {
                    resolve(result[aiAnalyzer.config.storageKeys.provider] || aiAnalyzer.config.defaultProvider);
                });
            } catch (error) {
                console.error("Error getting provider from storage:", error);
                resolve(aiAnalyzer.config.defaultProvider); // Fallback to default provider
            }
        });
    },

    // Update analysis status message
    updateAnalysisStatus: function (message) {
        const resultArea = document.getElementById('compatibilityResults');
        if (resultArea) {
            resultArea.innerHTML = `<div class="analysis-status">${message}</div>`;
        }
    },

    // Display analysis result
    displayAnalysisResult: function (analysis) {
        const resultArea = document.getElementById('compatibilityResults');
        if (!resultArea) return;

        let html = '<div class="analysis-result">';

        // Display result for each platform
        for (const [platform, data] of Object.entries(analysis)) {
            const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
            const compatClass = data.compatible ? 'compatible' : 'incompatible';

            html += `
                <div class="platform-result ${compatClass}">
                    <div class="platform-header">
                        <span class="platform-name">${platformName}</span>
                        <span class="compatibility-badge ${compatClass}">
                            ${data.compatible ? 'Compatible' : 'Incompatible'}
                        </span>
                    </div>
                    <div class="platform-reasoning">${data.reasoning}</div>
                </div>
            `;
        }

        html += '</div>';
        resultArea.innerHTML = html;
    },

    // Display analysis error
    displayAnalysisError: function (errorMessage) {
        const resultArea = document.getElementById('compatibilityResults');
        if (resultArea) {
            resultArea.innerHTML = `<div class="analysis-error">Error: ${errorMessage}</div>`;
        }
    },

    // Main analysis function
    analyzePlatformCompatibility: function (provider, apiKey, hlsData) {
        const prompt = this.buildAnalysisPrompt(hlsData);

        if (provider === this.config.providers.gemini) {
            return this.callGeminiAPI(apiKey, prompt);
        } else if (provider === this.config.providers.anthropic) {
            return this.callAnthropicAPI(apiKey, prompt);
        } else {
            return Promise.reject(new Error(`Unsupported provider: ${provider}`));
        }
    },

    // Build the prompt for the LLM
    buildAnalysisPrompt: function (hlsData) {
        const dataString = JSON.stringify(hlsData, null, 2); // Pretty print for readability

        return `
Analyze the following HLS stream data derived from a 2-4 minute window:

\`\`\`json
${dataString}
\`\`\`

Based *only* on the provided data (manifest structure, codecs, resolution ladder, DRM signals, content protection, audio tracks), determine the compatibility of this stream with the following platforms:
1.  iOS (recent versions)
2.  Android (recent versions)
3.  Google Chromecast (latest generation)
4.  Roku (recent models)
5.  Tizen Smart TVs (recent models)

Provide your analysis strictly in JSON format. The JSON object should have a top-level key for each platform ('ios', 'android', 'chromecast', 'roku', 'tizen'). Each platform key should map to an object containing exactly two fields:
-   'compatible': A boolean value (true or false).
-   'reasoning': A concise string explaining the compatibility assessment based *specifically* on the provided HLS data points (e.g., codec support, resolution limits, DRM requirements, audio track types). If compatibility is uncertain due to missing information in the provided data, state that in the reasoning.

Example of desired JSON output structure:
\`\`\`json
{
  "ios": {
    "compatible": true,
    "reasoning": "Compatible: Uses H.264 video and AAC audio, standard resolutions, and FairPlay DRM (if applicable and signaled)."
  },
  "android": {
    "compatible": true,
    "reasoning": "Compatible: Uses H.264/H.265 video and AAC/AC3 audio, Widevine DRM (if applicable and signaled)."
  },
  "chromecast": {
    "compatible": false,
    "reasoning": "Incompatible: Manifest indicates HEVC Main10 profile which may not be supported on all Chromecast generations without specific hardware."
  },
  "roku": {
    "compatible": true,
    "reasoning": "Compatible: Standard H.264/AAC, includes various resolutions suitable for Roku bandwidth adaptation."
  },
  "tizen": {
     "compatible": true,
     "reasoning": "Compatible: Supports H.264/HEVC and common audio codecs like AAC/EAC3. PlayReady DRM (if applicable and signaled) is supported."
  }
}
\`\`\`

Output ONLY the JSON object. Do not include any introductory text, explanations, or markdown formatting around the JSON block.
`;
    },

    // Update the callGeminiAPI function around line 430-450
    callGeminiAPI: function (apiKey, prompt) {
        const endpoint = `${this.config.endpoints.gemini}?key=${apiKey}`;
        const requestBody = {
            contents: [{
                parts: [{ text: prompt }]
            }]
        };

        return fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        })
            .then(response => {
                if (!response.ok) {
                    return response.text().then(text => {
                        throw new Error(`Gemini API error: ${response.status} - ${text}`);
                    });
                }
                return response.json();
            })
            .then(data => {
                const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!content) {
                    throw new Error("Gemini API Error: Empty response");
                }

                // Clean and parse the content
                const cleanedContent = content.replace(/^```json\s*|```$/g, '').trim();
                try {
                    return JSON.parse(cleanedContent);
                } catch (error) {
                    console.error("Failed to parse Gemini response as JSON:", cleanedContent);
                    throw new Error("Failed to parse AI response as JSON");
                }
            });
    },

    // Call the Anthropic API
    callAnthropicAPI: function (apiKey, prompt) {
        const endpoint = this.config.endpoints.anthropic;
        const requestBody = {
            model: this.config.models.anthropic,
            messages: [
                { role: 'user', content: [{ type: 'text', text: prompt }] }
            ],
            max_tokens: 1500
        };

        return fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true' // Add this header
            },
            body: JSON.stringify(requestBody)
        })
            .then(response => {
                if (!response.ok) {
                    return response.text().then(text => {
                        throw new Error(`Anthropic API error: ${response.status} - ${text}`);
                    });
                }
                return response.json();
            })
            .then(data => {
                const content = data?.content?.[0]?.text;
                if (!content) {
                    throw new Error("Anthropic API Error: Empty response");
                }

                // Clean and parse the content
                const cleanedContent = content.replace(/^```json\s*|```$/g, '').trim();
                try {
                    return JSON.parse(cleanedContent);
                } catch (error) {
                    console.error("Failed to parse Anthropic response as JSON:", cleanedContent);
                    throw new Error("Failed to parse AI response as JSON");
                }
            });
    }
};

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
    // Initialize the AI analyzer
    aiAnalyzer.init();
    console.log("AI Analyzer module loaded");
});