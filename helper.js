document.addEventListener('DOMContentLoaded', function() {
    // Add click handlers to all common URL buttons
    const urlButtons = document.querySelectorAll('.common-url');
    urlButtons.forEach(button => {
        button.addEventListener('click', function() {
            const url = this.getAttribute('data-url');
            if (url && window.opener && !window.opener.closed) {
                // Set the URL in the parent window's input field
                const inputField = window.opener.document.getElementById('hlsUrl');
                if (inputField) {
                    inputField.value = url;
                    
                    // Optionally trigger the play button
                    const playButton = window.opener.document.getElementById('playVideo');
                    if (playButton) {
                        playButton.click();
                    }
                    
                    // Close this helper window
                    window.close();
                }
            }
        });
    });

    // Setup Test Channel functionality
    const goButton = document.getElementById('goButton');
    if (goButton) {
        goButton.addEventListener('click', fetchAndSetPlayURL);
    }

    // Setup channel input with validation and keyboard events
    const channelInput = document.getElementById('channelInput');
    if (channelInput) {
        // Setup keyboard event for channel input (Enter key)
        channelInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                // Only trigger fetch if the channel is valid (button not disabled)
                const goButton = document.getElementById('goButton');
                if (goButton && !goButton.disabled) {
                    fetchAndSetPlayURL();
                }
            }
        });

        // Setup real-time validation for channel input
        channelInput.addEventListener('input', function () {
            const channel = this.value.trim().toLowerCase();
            const goButton = document.getElementById('goButton');

            if (goButton) {
                // Disable the button if the channel doesn't exist
                if (channel && !channelsData.channels[channel]) {
                    goButton.disabled = true;
                    goButton.title = `Channel "${channel}" not available`;
                    this.style.borderColor = "#ff6b6b"; // Red border for invalid channel
                } else {
                    goButton.disabled = false;
                    goButton.title = "";
                    this.style.borderColor = channel ? "#4CAF50" : ""; // Green border for valid channel, default otherwise
                }
            }
        });
    }

    // Make sure CDN dropdown is initialized
    const cdnSelect = document.getElementById('cdnSelect');
    if (!cdnSelect) {
        console.error("CDN dropdown not found");
    }
});

// Internal JSON object with channel configurations
const channelsData = {
    // Common environment configurations by category
    environments: {
        sports: {
            prod: {
                path: "http://k8s-sportsproduseast1-e77211e626-767331699.us-east-1.elb.amazonaws.com/v1/live?"
            },
            qa: {
                path: "http://k8s-sportsqauswest2-a3adee7975-698804697.us-west-2.elb.amazonaws.com/v1/live?"
            }
        }
    },
    
    // Common patterns for different categories
    patterns: {
        sports: "cdn={param:cdn}&bu=sports&duration=31536000&mcl_region={param:mcl_region}&ad_env=1&_fw_ae=nomvpd&_fw_did=85fe6c6c-1f37-68e4-c0f1-872d10abbda6&_fw_did_android_id=&_fw_did_google_advertising_id=&_fw_did_idfa=&_fw_is_lat=0&_fw_nielsen_app_id=P5CFA3B51-3361-481F-B75D-D119A71FF616&_fw_seg=&_fw_us_privacy=1YNN&_fw_vcid2=516429%3A85fe6c6c-1f37-68e4-c0f1-872d10abbda6&ad=fw_prod&ad.csid=fsapp%2Fwebdesktop%2Flive%2Ffs1&ad.flags=+slcb+sltp+qtcb+emcr+fbad+dtrd+vicb&ad.metr=7&ad.prof=516429%3Ayospace_foxsports_webdesktop_live&ad_mode=JIT&caid=EP044429620282&is_lat=0&kuid=&thumbsray=0&traceid=watch-watch-cj%28Mo%25c9mz2B&yo.av=4&yo.eb.bp=profile-jit&yo.lpa=dur&yo.pdt=sync&yo.po=-3&yo.pst=true&yo.t.jt=1500&yo.t.pr=1500&yo.ug=11801&yo.vm=W3siREVTSVJFRF9EVVJBVElPTiI6ICIke0RFU0lSRURfRFVSQVRJT05fU0VDU30iLCAiUFJPR1JBTV9DQUlEIjogIiR7TUVUQURBVEEuQ0FJRH0ifV0K"
    },
    
    // Channels 
    channels: {
        // Standard channels with category mapping
        "foxsports1": { 
            category: "sports"
        },
        "foxsports2": { 
            category: "sports" 
        },
        "deportes": { 
            category: "sports" 
        }
    }
};

// Function to get region code based on selection
function getRegionCode() {
    const regionEast = document.getElementById('regionEast');
    return regionEast && regionEast.checked ? "ue1" : "uw2";
}

// Function to get environment based on selection
function getEnvironment() {
    const envProd = document.getElementById('envProd');
    return envProd && envProd.checked ? "prod" : "qa";
}

// Function to get CDN based on dropdown selection
function getCDN() {
    const cdnSelect = document.getElementById('cdnSelect');
    return cdnSelect && cdnSelect.value ? cdnSelect.value : "cf"; // Default to Cloudfront if not selected
}

// Helper function to get CDN name from code
function getCdnName(cdnCode) {
    switch(cdnCode) {
        case 'cf': return 'Cloudfront';
        case 'ak': return 'Akamai';
        case 'fa': return 'Fastly';
        default: return 'Unknown';
    }
}

// Function to fetch and set the play URL
async function fetchAndSetPlayURL() {
    // Get form values
    const channelInput = document.getElementById('channelInput');
    const channel = channelInput ? channelInput.value.trim().toLowerCase() : "";
    
    if (!channel) {
        alert("Please enter a channel name");
        return;
    }
    
    // Check if the channel exists in our configuration
    if (!channelsData.channels[channel]) {
        alert(`Channel "${channel}" is not available.`);
        return;
    }
    
    const region = getRegionCode();
    const environment = getEnvironment();
    const cdn = getCDN();
    
    try {
        // Show loading state
        const goButton = document.getElementById('goButton');
        if (goButton) {
            goButton.textContent = "Loading...";
            goButton.disabled = true;
        }
        
        const playURL = await fetchPlayURL(channel, region, environment, cdn);
        
        // Reset button state
        if (goButton) {
            goButton.textContent = "Go";
            goButton.disabled = false;
        }
        
        if (playURL) {
            // Set the URL in the parent window and play
            if (window.opener && !window.opener.closed) {
                const inputField = window.opener.document.getElementById('hlsUrl');
                if (inputField) {
                    inputField.value = playURL;
                    
                    // Trigger the play button
                    const playButton = window.opener.document.getElementById('playVideo');
                    if (playButton) {
                        playButton.click();
                    }
                    
                    // Close this helper window
                    window.close();
                }
            } else {
                alert("Unable to communicate with the main window");
            }
        } else {
            alert("Failed to get stream URL. Check console for details.");
        }
    } catch (error) {
        // Reset button state
        const goButton = document.getElementById('goButton');
        if (goButton) {
            goButton.textContent = "Go";
            goButton.disabled = false;
        }
        
        console.error("Error in fetchAndSetPlayURL:", error);
        alert(`Error: ${error.message}`);
    }
}

// Function to fetch the play URL
async function fetchPlayURL(channel, region, environment, cdn) {
    console.log(`Fetching playURL for channel: ${channel}, region: ${region}, env: ${environment}, cdn: ${cdn} (${getCdnName(cdn)})`);
    
    // Check if channel exists in our data
    if (!channelsData.channels[channel]) {
        console.error(`Error: Channel '${channel}' not found.`);
        return null;
    }
    
    // Get channel configuration
    const channelConfig = channelsData.channels[channel];
    const category = channelConfig.category;
    
    // Check if the category exists
    if (!channelsData.environments[category] || !channelsData.environments[category][environment]) {
        console.error(`Error: Category '${category}' or environment '${environment}' not found for channel '${channel}'.`);
        return null;
    }

    // Modify channel name for QA environment
    let requestChannel = channel;
    if (environment === "qa") {
        requestChannel = `${channel}-qa`;
        console.log(`Using QA-formatted channel name: ${requestChannel}`);
    }
    
    // Get environment path - check for channel-specific override first, then fall back to category default
    let envPath;
    if (channelConfig.env && channelConfig.env[environment] && channelConfig.env[environment].path) {
        envPath = channelConfig.env[environment].path;
    } else {
        envPath = channelsData.environments[category][environment].path;
    }
    
    // Construct the base URL
    const url = `${envPath}cdn=${cdn}&channel=${requestChannel}&mcl_region=${region}`;
    
    // Get pattern - check for channel-specific override first, then fall back to category default
    let pattern;
    if (channelConfig.pattern) {
        pattern = channelConfig.pattern;
    } else if (channelsData.patterns[category]) {
        pattern = channelsData.patterns[category];
    } else {
        console.error(`Error: No pattern found for channel '${channel}' or category '${category}'.`);
        return null;
    }
    
    const postData = {
        pattern: pattern
    };
    
    try {
        console.log("Fetching from URL:", url);
        console.log("With payload:", postData);
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(postData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP error! Status: ${response.status}, Response: ${errorText}`);
        }
        
        const result = await response.json();
        console.log("API Response:", result);
        
        if (result.playURL) {
            console.log("Successfully retrieved playURL:", result.playURL);
            return result.playURL;
        } else {
            console.error("API response did not contain playURL:", result);
            return null;
        }
    } catch (error) {
        console.error("Error fetching playURL:", error.message);
        throw error;
    }
}