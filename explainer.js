document.addEventListener('DOMContentLoaded', function() {
    // Receive data from opener
    window.addEventListener('message', function(event) {
        // Verify origin for security
        if (event.origin !== window.location.origin) return;
        
        // Process the data
        if (event.data && event.data.type === 'scteData') {
            displayScteExplanation(event.data.scteData);
        }
    });
    
    // If window was opened by parent, request data
    if (window.opener && !window.opener.closed) {
        // Tell parent window we're ready
        window.opener.postMessage({ type: 'explainerReady', explainerType: 'scte' }, '*');
    }
});

// Function to generate and display explanation
function displayScteExplanation(data) {
    const scteExplanation = document.getElementById('scteExplanation');
    if (!scteExplanation) return;
    
    let explanationHTML = '<h2>Explanation of the SCTE-35 / Ad Tracking Metrics</h2><ul>';
    
    // Ad Breaks explanation
    explanationHTML += `<li><strong>Ad Breaks: ${data.adCount} (${data.adCompletionRate}% complete)</strong>: `;
    
    if (data.adCount === 0) {
        explanationHTML += 'No ad breaks have been detected in this stream yet.';
    } else if (data.adCompletionRate === 0) {
        explanationHTML += `${data.adCount} ad break markers have been detected, but none have matching end markers. This suggests the stream may be using ad markers but not properly closing them.`;
    } else if (data.adCompletionRate === 100) {
        explanationHTML += `All ${data.adCount} ad breaks have been properly closed with matching end markers.`;
    } else {
        explanationHTML += `Only ${data.adCompletionRate}% of ad breaks have matching end markers. The rest are either still active or missing proper end markers.`;
    }
    explanationHTML += '</li>';
    
    // Est. Ad Time explanation
    explanationHTML += `<li><strong>Est. Ad Time: ${data.adDuration.toFixed(1)}s</strong>: `;
    if (data.adDuration > 0) {
        const minutes = Math.floor(data.adDuration / 60);
        const seconds = Math.round(data.adDuration % 60);
        explanationHTML += `The stream contains approximately ${minutes} minutes and ${seconds} seconds of advertisement time. `;
        
        if (data.contentDuration > 0) {
            const ratio = data.adDuration / data.contentDuration;
            explanationHTML += `This represents a ratio of 1:${(1/ratio).toFixed(1)} (ad time:content time).`;
        } else {
            explanationHTML += 'No content duration has been measured yet to calculate a ratio.';
        }
    } else {
        explanationHTML += 'No ad duration has been measured yet.';
    }
    explanationHTML += '</li>';
    
    // Recent Markers explanation
    explanationHTML += '<li><strong>Recent Markers</strong>: ';
    if (data.markers.length === 0) {
        explanationHTML += 'No SCTE-35 markers have been detected in this stream yet.';
    } else {
        explanationHTML += 'These show the most recent SCTE-35 markers detected in the stream. ';
        explanationHTML += '<ul>';
        explanationHTML += '<li><strong style="color:#2ecc71;">AD-START</strong> (green): Indicates the beginning of an ad break.</li>';
        explanationHTML += '<li><strong style="color:#e74c3c;">AD-END</strong> (red): Indicates the end of an ad break and return to regular content.</li>';
        explanationHTML += '</ul>';
        explanationHTML += 'In a properly marked stream, each AD-START should have a matching AD-END marker.';
    }
    explanationHTML += '</li>';
    
    // Graph explanation
    explanationHTML += '<li><strong>The Graph</strong>: ';
    if (data.adDuration === 0 && data.contentDuration === 0) {
        explanationHTML += 'The graph will display the ratio between ad time and content time once data is available.';
    } else {
        const adRatio = (data.adDuration / (data.adDuration + data.contentDuration) * 100).toFixed(1);
        explanationHTML += `The bar graph shows that ads make up ${adRatio}% of the total stream duration. `;
        explanationHTML += 'The <span style="color:#e74c3c;">red portion</span> represents content time, while the <span style="color:#2ecc71;">green portion</span> represents ad time.';
    }
    explanationHTML += '</li>';
    
    explanationHTML += '</ul>';
    
    explanationHTML += `<p><strong>What is SCTE-35?</strong> SCTE-35 is a broadcast standard that inserts digital cue markers in video streams to signal where advertisements can be inserted. These markers are essential for targeted ad insertion in streaming media.</p>`;
    
    scteExplanation.innerHTML = explanationHTML;
}