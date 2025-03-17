async function fetchMetadata(url) {
    try {
        let response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }
        let text = await response.text();
        let metadataList = document.getElementById("metadataList");
        metadataList.innerHTML = ""; // Clear old metadata
        
        text.split("\n").forEach(line => {
            if (line.startsWith("#")) {
                let item = document.createElement("div");
                item.textContent = line;
                metadataList.appendChild(item);
            }
        });
    } catch (error) {
        console.error("Error fetching metadata:", error);
        let metadataList = document.getElementById("metadataList");
        let errorItem = document.createElement("div");
        errorItem.textContent = `Error fetching manifest: ${error.message}`;
        errorItem.style.color = "red";
        metadataList.appendChild(errorItem);
    }
}