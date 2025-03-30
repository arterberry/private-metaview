document.addEventListener('DOMContentLoaded', function () {
    // Update the title based on hash
    const explainerType = window.location.hash.slice(1) || 'scte';
    if (explainerType === 'cache') {
        document.title = 'VIDINFRA MetaView - Cache Explainer';
    } else if (explainerType === 'scte') {
        document.title = 'VIDINFRA MetaView - SCTE-35 Explainer';
    }

    // Receive data from opener
    window.addEventListener('message', function (event) {
        // Verify origin for security
        if (event.origin !== window.location.origin) return;

        // Process the data based on type
        if (event.data && event.data.type === 'scteData') {
            displayScteExplanation(event.data.scteData);
        } else if (event.data && event.data.type === 'cacheData') {
            displayCacheExplanation(event.data.cacheData);
        }
    });

    // If window was opened by parent, request data
    if (window.opener && !window.opener.closed) {
        // Tell parent window we're ready
        window.opener.postMessage({
            type: 'explainerReady',
            explainerType: explainerType
        }, '*');
    }
});

// Helper function to format time values in a more readable format
function formatTimeValue(seconds) {
    if (seconds < 60) {
        return `${seconds} seconds`;
    } else if (seconds < 3600) {
        return `${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds`;
    } else if (seconds < 86400) {
        return `${Math.floor(seconds / 3600)} hours ${Math.floor((seconds % 3600) / 60)} minutes`;
    } else {
        return `${Math.floor(seconds / 86400)} days ${Math.floor((seconds % 86400) / 3600)} hours`;
    }
}


// Helper function to identify cache pattern from history
function identifyCachePattern(history) {
    if (!history || history.length < 5) return "";

    const recentHistory = history.slice(-10); // Look at last 10 entries
    const hits = recentHistory.filter(val => val === 1).length;
    const misses = recentHistory.length - hits;
    const hitRatio = (hits / recentHistory.length) * 100;

    if (hitRatio === 100) {
        return "Your recent segments show a perfect cache hit pattern, indicating optimal delivery efficiency.";
    } else if (hitRatio === 0) {
        return "Your recent segments show all cache misses, suggesting new or uncached content.";
    } else if (hitRatio > 80) {
        return "Your recent segments show mostly cache hits with occasional misses, which is very good performance.";
    } else if (hitRatio < 20) {
        return "Your recent segments show mostly cache misses with occasional hits, suggesting this content is just beginning to be cached.";
    } else {
        // Check for patterns in the sequence
        const firstFewMisses = recentHistory.slice(0, 5).every(val => val === 0);
        const laterHits = recentHistory.slice(-5).filter(val => val === 1).length >= 3;

        if (firstFewMisses && laterHits) {
            return "Your cache pattern shows initial misses followed by increasing hits - typical of content being freshly cached.";
        } else {
            return "Your cache pattern shows a mix of hits and misses, which is common for dynamic content or content with varying popularity.";
        }
    }
}

// Function to generate and display SCTE explanation
function displayScteExplanation(data) {
    const explanationElement = document.getElementById('explanationContent');
    if (!explanationElement) return;

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
            explanationHTML += `This represents a ratio of 1:${(1 / ratio).toFixed(1)} (ad time:content time).`;
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

    // Add SCTE-35 detailed explanation section
    explanationHTML += '<li><strong>SCTE-35 Details</strong>: ';
    explanationHTML += 'The SCTE-35 details panel (if expanded) shows a deeper analysis of the SCTE-35 signals in the stream. ';
    explanationHTML += 'This includes the command type, event ID, PTS timing, and other technical metadata extracted from the binary SCTE-35 payload. ';
    explanationHTML += 'The timeline at the bottom visualizes when these markers appear throughout the stream duration.';
    explanationHTML += '</li>';

    explanationHTML += '</ul>';

    explanationHTML += `<p><strong>What is SCTE-35?</strong> SCTE-35 is a broadcast standard that inserts digital cue markers in video streams to signal where advertisements can be inserted. These markers are essential for targeted ad insertion in streaming media.</p>`;

    explanationHTML += `<p><strong>SCTE-35 Commands:</strong> The most common SCTE-35 commands are:</p>`;
    explanationHTML += `<ul>
        <li><strong>Splice Insert (0x05):</strong> Indicates a splice point where content should be replaced with another piece of content.</li>
        <li><strong>Time Signal (0x06):</strong> Carries time-related information, often with segmentation descriptors that indicate the nature of the splice point.</li>
        <li><strong>Segmentation Descriptor:</strong> Provides detailed information about the type of segmentation event (ad start/end, program boundaries, etc.).</li>
    </ul>`;

    // Update the content
    document.getElementById('explainerTitle').textContent = 'SCTE-35 / Ad Tracking Explainer';
    explanationElement.innerHTML = explanationHTML;
}

// Function to generate and display Cache explanation
function displayCacheExplanation(data) {
    console.log("displayCacheExplanation called with data:", data);
    const explanationElement = document.getElementById('explanationContent');
    if (!explanationElement) return;

    let explanationHTML = '<h2>Explanation of Cache Performance and TTL Metrics</h2><ul>';

    // Cache Hit Ratio explanation
    explanationHTML += `<li><strong>Cache Hit Ratio: ${data.hitRatio}%</strong>: `;
    if (data.total === 0) {
        explanationHTML += 'No segments have been loaded yet. As you play the video, this will show the percentage of segments loaded from the CDN cache.';
    } else {
        explanationHTML += `Out of ${data.total} total segments loaded, ${data.hits} were cache hits (${data.hitRatio}%). `;

        if (parseFloat(data.hitRatio) < 30) {
            explanationHTML += 'This low hit ratio suggests that content is not well cached, possibly indicating fresh content or a cache configuration issue.';
        } else if (parseFloat(data.hitRatio) < 70) {
            explanationHTML += 'This moderate hit ratio is typical for content that has been viewed a few times or has partial caching.';
        } else {
            explanationHTML += 'This high hit ratio indicates well-cached content that is being efficiently delivered from CDN edge servers.';
        }
    }
    explanationHTML += '</li>';

    // TTL explanation
    explanationHTML += '<li><strong>Cache TTL (Time To Live)</strong>: ';
    if (!data.cacheTTL || !data.cacheTTL.hasDirectives) {
        explanationHTML += 'No TTL directives have been detected in the stream. This could mean caching headers are not being set properly.';
    } else {
        explanationHTML += 'The TTL directives control how long segments can be stored in cache: ';

        // Replace the bullet point list with just the detailed explanation
        explanationHTML += `<h3>Understanding TTL Components</h3>
        <dl style="margin-left: 20px;">
            <dt><strong>Max Age: ${data.cacheTTL.maxAge} seconds (${formatTimeValue(data.cacheTTL.maxAge)})</strong></dt>
            <dd>Max Age is the maximum time that content can remain in a cache before it must be revalidated with the origin server. In this case, a value of 86400 seconds (1 day) means the CDN is allowed to serve this content from cache for that duration without checking if there's a newer version available. This relatively long max-age value improves performance and reduces origin server load.</dd>
            
            <dt><strong>Current Age: ${data.cacheTTL.age} seconds</strong></dt>
            <dd>Current Age shows how long the content has already been in the cache system. The value of 364 seconds (about 6 minutes) indicates this content has been in cache for a short time. This is tracked through the "Age" header in HTTP responses. This relatively low age value means the content was cached recently.</dd>
            
            <dt><strong>Remaining TTL: ${Math.max(0, data.cacheTTL.maxAge - data.cacheTTL.age)} seconds (${formatTimeValue(Math.max(0, data.cacheTTL.maxAge - data.cacheTTL.age))})</strong></dt>
            <dd>Remaining TTL is calculated as (Max Age - Current Age), showing how much longer the content can be served from cache before it expires. With over 86,000 seconds (almost 24 hours) remaining, you can expect reliable and fast content delivery for this duration before the cache needs to fetch a fresh copy from the origin server.</dd>
            
            <dt><strong>Directives: ${data.cacheTTL.cacheControl || 'max-age=' + data.cacheTTL.maxAge}</strong></dt>
            <dd>These are specific instructions in the Cache-Control HTTP header that tell caching systems how to handle the content:
                <ul style="margin-top: 5px;">
                    <li><code>max-age=86400</code>: The main TTL value - cache content for 1 day</li>
                    <li><code>stale-while-revalidate=3600</code>: Continue serving stale content for up to 1 hour while fetching a fresh copy in the background</li>
                    <li><code>stale-if-error=3600</code>: Serve stale content for up to 1 hour if the origin server returns an error</li>
                </ul>
                These advanced directives improve reliability by allowing content to be served even when the origin server is temporarily unavailable.
            </dd>
        </dl>`;
    }
    explanationHTML += '</li>';

    // Graph explanation
    explanationHTML += '<li><strong>The Graph</strong>: ';
    explanationHTML += 'The line graph tracks cache performance over time. Points near the top (HIT) indicate segments loaded from cache, while points near the bottom (MISS) indicate segments that needed to be fetched from the origin.';
    if (data.history && data.history.length > 0) {
        const pattern = identifyCachePattern(data.history);
        explanationHTML += ` ${pattern}`;
    }
    explanationHTML += '</li>';

    explanationHTML += '</ul>';

    explanationHTML += `<p><strong>What is Cache Performance?</strong> Cache performance metrics show how effectively a CDN (Content Delivery Network) is storing and delivering video segments. High cache hit ratios reduce origin server load and can significantly improve playback performance by reducing buffering and startup times.</p>`;

    explanationHTML += `<p><strong>What is TTL?</strong> Time To Live (TTL) defines how long content can remain in cache before it must be revalidated with the origin server. Longer TTL values improve performance but may delay updates to content, while shorter TTL values ensure fresher content but may increase origin traffic.</p>`;

    // Update the content
    document.getElementById('explainerTitle').textContent = 'Cache Performance Explainer';
    explanationElement.innerHTML = explanationHTML;
}