// DO NOT use export
window.ResolutionAnalyzer = {
    async fetchResolutions(manifestUrl) {
        try {
            const response = await fetch(manifestUrl);
            const text = await response.text();
            return this.extractResolutions(text);
        } catch (err) {
            console.error("ResolutionAnalyzer: Failed to fetch manifest", err);
            return [];
        }
    },

    extractResolutions(manifestText) {
        const resolutions = [];
        const lines = manifestText.split('\n');

        lines.forEach(line => {
            if (line.includes('#EXT-X-STREAM-INF:') && line.includes('RESOLUTION=')) {
                const resMatch = line.match(/RESOLUTION=(\d+x\d+)/);
                const bwMatch = line.match(/BANDWIDTH=(\d+)/);

                if (resMatch) {
                    resolutions.push({
                        resolution: resMatch[1],
                        bandwidth: bwMatch ? `${Math.round(parseInt(bwMatch[1]) / 1000)} kbps` : 'unknown'
                    });
                }
            }
        });

        return resolutions;
    },

    renderToDOM(resolutions, containerId = 'resolutionList') {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';

        if (resolutions.length === 0) {
            container.innerHTML = '<div>No resolution variants found</div>';
            return;
        }

        resolutions.forEach((entry, i) => {
            const div = document.createElement('div');
            div.className = 'resolution-item';
            div.textContent = `${i + 1}. Resolution: ${entry.resolution}, Bandwidth: ${entry.bandwidth}`;
            container.appendChild(div);
        });
    }
};
