document.addEventListener("DOMContentLoaded", function () {
    // Elements
    const emailInput = document.getElementById("emailInput");
    const signinButton = document.getElementById("signinButton");
    const signinStatus = document.getElementById("signinStatus");

    const aiKeyInput = document.getElementById("aiKeyInput");
    const setKeyButton = document.getElementById("setKeyButton");
    const showKeyButton = document.getElementById("showKeyButton");
    const keyStatus = document.getElementById("keyStatus");

    // JSON Editor Elements
    const settingsJsonEditor = document.getElementById("settingsJsonEditor");
    const channelsJsonEditor = document.getElementById("channelsJsonEditor");
    const saveJsonButton = document.getElementById("saveJsonButton");
    const jsonStatus = document.getElementById("jsonStatus");

    // Tab Elements
    const settingsTabBtn = document.getElementById("settingsTabBtn");
    const channelsTabBtn = document.getElementById("channelsTabBtn");
    const settingsTab = document.getElementById("settingsTab");
    const channelsTab = document.getElementById("channelsTab");

    // Constants
    const AI_KEY_STORAGE_KEY = "vidinfra_ai_key";
    const AI_PROVIDER_STORAGE_KEY = "vidinfra_ai_provider";

    // Initialize
    initializeAdminPanel();

    // Event Listeners
    if (signinButton) {
        signinButton.addEventListener("click", handleSignIn);
    }

    if (setKeyButton) {
        setKeyButton.addEventListener("click", handleSetKey);
    }

    if (showKeyButton) {
        showKeyButton.addEventListener("click", toggleShowKey);
    }

    if (saveJsonButton) {
        saveJsonButton.addEventListener("click", handleSaveJson);
    }

    if (setProviderButton) {
        setProviderButton.addEventListener("click", handleSetProvider);
    }

    // Tab Event Listeners
    if (settingsTabBtn) {
        settingsTabBtn.addEventListener("click", function () {
            switchTab('settings');
        });
    }

    if (channelsTabBtn) {
        channelsTabBtn.addEventListener("click", function () {
            switchTab('channels');
        });
    }

    // Functions
    function initializeAdminPanel() {
        // Check for stored AI key and provider
        try {
            // First, get the API key
            chrome.storage.local.get([AI_KEY_STORAGE_KEY], function (result) {
                if (result[AI_KEY_STORAGE_KEY]) {
                    // Key exists, show as masked
                    aiKeyInput.value = "••••••••••••••••••••••••••";
                    aiKeyInput.classList.add("key-hidden");
                    keyStatus.textContent = "Key loaded from storage";
                    showKeyButton.textContent = "Show";
                }
            });

            // Separately get the provider setting
            chrome.storage.local.get([AI_PROVIDER_STORAGE_KEY], function (result) {
                if (result[AI_PROVIDER_STORAGE_KEY] && aiProviderSelect) {
                    // Set the dropdown to the stored provider
                    aiProviderSelect.value = result[AI_PROVIDER_STORAGE_KEY];
                }
            });
        } catch (error) {
            console.error("Error accessing storage:", error);
        }

        // Load dummy Settings JSON data (placeholder)
        const dummySettings = {
            "settings": {
                "cacheMonitoring": true,
                "adTrackingEnabled": true,
                "maxLogEntries": 5000
            },
            "aiIntegration": {
                "enabled": false,
                "model": "gpt-4"
            },
            "uiCustomization": {
                "theme": "light",
                "showAdvancedMetrics": true
            }
        };

        // Load Channels JSON data
        const dummyChannels = {
            "channels": {
                "foxsports1": {
                    "category": "sports"
                },
                "foxsports2": {
                    "category": "sports"
                },
                "deportes": {
                    "category": "sports"
                }
            }
        };

        // Populate both editors
        if (settingsJsonEditor) {
            settingsJsonEditor.value = JSON.stringify(dummySettings, null, 2);
        }

        if (channelsJsonEditor) {
            channelsJsonEditor.value = JSON.stringify(dummyChannels, null, 2);
        }

        // Setup initial tab state
        switchTab('settings');
    }

    // Function to switch between tabs
    function switchTab(tabName) {
        // Reset all tabs
        settingsTabBtn.classList.remove('active');
        channelsTabBtn.classList.remove('active');
        settingsTab.classList.remove('active');
        channelsTab.classList.remove('active');

        // Activate selected tab
        if (tabName === 'settings') {
            settingsTabBtn.classList.add('active');
            settingsTab.classList.add('active');
        } else if (tabName === 'channels') {
            channelsTabBtn.classList.add('active');
            channelsTab.classList.add('active');
        }
    }

    function handleSignIn() {
        const email = emailInput.value.trim();

        if (!email) {
            signinStatus.textContent = "Please enter your email address";
            signinStatus.className = "error-message";
            return;
        }

        if (!isValidEmail(email)) {
            signinStatus.textContent = "Please enter a valid email address";
            signinStatus.className = "error-message";
            return;
        }

        // This is just a placeholder - no actual authentication
        signinStatus.textContent = "Sign in successful (placeholder)";
        signinStatus.className = "status-message";
    }

    function handleSetKey() {
        const key = aiKeyInput.value.trim();

        // Skip if it's the masked placeholder
        if (aiKeyInput.classList.contains("key-hidden")) {
            keyStatus.textContent = "Please enter a new key or click Show to edit the existing key";
            keyStatus.className = "error-message";
            return;
        }

        if (!key) {
            keyStatus.textContent = "Please enter an API key";
            keyStatus.className = "error-message";
            return;
        }

        // Store the key securely in chrome.storage
        try {
            chrome.storage.local.set({ [AI_KEY_STORAGE_KEY]: key }, function () {
                // Mask the key in the input
                aiKeyInput.value = "••••••••••••••••••••••••••";
                aiKeyInput.classList.add("key-hidden");

                keyStatus.textContent = "API key saved successfully";
                keyStatus.className = "status-message";
                showKeyButton.textContent = "Show";
            });
        } catch (error) {
            console.error("Error saving to storage:", error);
            keyStatus.textContent = "Error saving API key: " + error.message;
            keyStatus.className = "error-message";
        }
    }

    function toggleShowKey() {
        if (aiKeyInput.classList.contains("key-hidden")) {
            // Show the key
            try {
                chrome.storage.local.get([AI_KEY_STORAGE_KEY], function (result) {
                    if (result[AI_KEY_STORAGE_KEY]) {
                        aiKeyInput.value = result[AI_KEY_STORAGE_KEY];
                        aiKeyInput.classList.remove("key-hidden");
                        showKeyButton.textContent = "Hide";
                    } else {
                        aiKeyInput.value = "";
                        aiKeyInput.classList.remove("key-hidden");
                        keyStatus.textContent = "No API key stored";
                        keyStatus.className = "error-message";
                    }
                });
            } catch (error) {
                console.error("Error accessing storage:", error);
                keyStatus.textContent = "Error retrieving API key: " + error.message;
                keyStatus.className = "error-message";
            }
        } else {
            // Hide the key
            aiKeyInput.value = "••••••••••••••••••••••••••";
            aiKeyInput.classList.add("key-hidden");
            showKeyButton.textContent = "Show";
        }
    }

    function handleSaveJson() {
        // Determine which tab is active
        const isSettingsActive = settingsTab.classList.contains('active');
        const currentEditor = isSettingsActive ? settingsJsonEditor : channelsJsonEditor;
        const jsonText = currentEditor.value.trim();

        if (!jsonText) {
            jsonStatus.textContent = "Please enter JSON configuration";
            jsonStatus.className = "error-message";
            return;
        }

        try {
            // Validate JSON format
            const jsonObj = JSON.parse(jsonText);

            // This is just a placeholder - no actual saving
            jsonStatus.textContent = isSettingsActive ?
                "Settings configuration saved successfully (placeholder)" :
                "Channels configuration saved successfully (placeholder)";
            jsonStatus.className = "status-message";

            // Log the configuration for debugging
            console.log(`Saved ${isSettingsActive ? 'Settings' : 'Channels'} configuration:`, jsonObj);

        } catch (error) {
            jsonStatus.textContent = "Invalid JSON format: " + error.message;
            jsonStatus.className = "error-message";
        }
    }

    // Handle setting AI provider
    function handleSetProvider() {
        const provider = aiProviderSelect.value;

        if (!provider) {
            keyStatus.textContent = "Please select an AI provider";
            keyStatus.className = "error-message";
            return;
        }

        // Store the provider in chrome.storage
        try {
            chrome.storage.local.set({ [AI_PROVIDER_STORAGE_KEY]: provider }, function () {
                keyStatus.textContent = `AI provider set to ${provider === 'anthropic' ? 'Anthropic Claude' : 'Google Gemini'}`;
                keyStatus.className = "status-message";
            });
        } catch (error) {
            console.error("Error saving provider to storage:", error);
            keyStatus.textContent = "Error saving provider: " + error.message;
            keyStatus.className = "error-message";
        }
    }

    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
});