// js/features/scte_manager.js
// This file contains the SCTE-35 manager for handling SCTE-35 messages
// and inserting them into the video stream.

console.log('[scte_manager] Initializing...');

(function () { // IIFE to encapsulate logic

    // SCTE-35 command types
    const SCTE35_COMMAND_TYPES = {
        0x00: 'null',
        0x05: 'splice_insert',
        0x06: 'splice_schedule',
        0x07: 'splice_time_signal',
        0x255: 'time_signal',
        0xFE: 'bandwidth_reservation',
        0xFF: 'private_command'
    };

    // SCTE-35 descriptor tags
    const SCTE35_DESCRIPTOR_TAGS = {
        0x00: 'avail_descriptor',
        0x01: 'dtmf_descriptor',
        0x02: 'segmentation_descriptor',
        0x03: 'time_descriptor',
        0x04: 'audio_descriptor'
    };

    // Segmentation type IDs
    const SEGMENTATION_TYPE_IDS = {
        0x00: 'Not Indicated',
        0x01: 'Content Identification',
        0x10: 'Program Start',
        0x11: 'Program End',
        0x12: 'Program Early Termination',
        0x13: 'Program Breakaway',
        0x14: 'Program Resumption',
        0x15: 'Program Runover Planned',
        0x16: 'Program Runover Unplanned',
        0x17: 'Program Overlap Start',
        0x18: 'Program Blackout Override',
        0x19: 'Program Join',
        0x20: 'Chapter Start',
        0x21: 'Chapter End',
        0x22: 'Break Start',
        0x23: 'Break End',
        0x24: 'Opening Credit Start',
        0x25: 'Opening Credit End',
        0x26: 'Closing Credit Start',
        0x27: 'Closing Credit End',
        0x30: 'Provider Advertisement Start',
        0x31: 'Provider Advertisement End',
        0x32: 'Distributor Advertisement Start',
        0x33: 'Distributor Advertisement End',
        0x34: 'Provider Placement Opportunity Start',
        0x35: 'Provider Placement Opportunity End',
        0x36: 'Distributor Placement Opportunity Start',
        0x37: 'Distributor Placement Opportunity End',
        0x38: 'Provider Overlay Placement Opportunity Start',
        0x39: 'Provider Overlay Placement Opportunity End',
        0x3A: 'Distributor Overlay Placement Opportunity Start',
        0x3B: 'Distributor Overlay Placement Opportunity End',
        0x3C: 'Provider Promo Start',
        0x3D: 'Provider Promo End',
        0x3E: 'Distributor Promo Start',
        0x3F: 'Distributor Promo End',
        0x40: 'Unscheduled Event Start',
        0x41: 'Unscheduled Event End',
        0x42: 'Alternative Content Opportunity Start',
        0x43: 'Alternative Content Opportunity End',
        0x44: 'Network Advertisement Start',
        0x45: 'Network Advertisement End',
        0x50: 'Network Signal Start',
        0x51: 'Network Signal End'
    };

    // Main SCTE35 parser
    const SCTE35Parser = {
        // Parse SCTE35 base64 data
        parseFromB64: function (base64Data) {
            try {
                // Convert base64 to binary
                const binary = atob(base64Data);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }

                return this.parseFromBytes(bytes);
            } catch (error) {
                console.error("Error parsing SCTE-35 base64:", error);
                return {
                    error: "Invalid base64 encoding",
                    raw: base64Data
                };
            }
        },

        // Parse SCTE35 binary data
        parseFromBytes: function (bytes) {
            try {
                let index = 0;

                // Parse table ID
                const tableId = bytes[index++];
                if (tableId !== 0xFC) {
                    return { error: "Not a valid SCTE-35 message (invalid table ID)" };
                }

                // Parse section syntax indicator and private indicator
                const sectionSyntaxIndicator = (bytes[index] & 0x80) !== 0;
                const privateIndicator = (bytes[index] & 0x40) !== 0;

                // Parse section length
                const sectionLength = ((bytes[index] & 0x0F) << 8) | bytes[index + 1];
                index += 2;

                // Parse protocol version and encrypted packet
                const protocolVersion = bytes[index] >> 5;
                const encryptedPacket = (bytes[index] & 0x10) !== 0;
                const encryptionAlgorithm = bytes[index] & 0x0F;
                index++;

                // Parse PTS adjustment
                const ptsAdjustment = this._readPTS(bytes.slice(index, index + 5));
                index += 5;

                // Parse CW index
                const cwIndex = bytes[index++];

                // Parse tier
                const tier = (bytes[index] << 8) | bytes[index + 1];
                index += 2;

                // Parse splice command length
                const spliceCommandLength = bytes[index++];

                if (spliceCommandLength === 0) {
                    return {
                        tableId,
                        sectionSyntaxIndicator,
                        privateIndicator,
                        sectionLength,
                        protocolVersion,
                        encryptedPacket,
                        encryptionAlgorithm,
                        ptsAdjustment,
                        cwIndex,
                        tier,
                        spliceCommandType: null,
                        spliceCommandInfo: null,
                        descriptorLoopLength: 0,
                        descriptors: []
                    };
                }

                // Parse splice command type
                const spliceCommandType = bytes[index++];

                // Parse splice command based on type
                let spliceCommandInfo = null;
                const commandEndIndex = index + spliceCommandLength - 1; // -1 for the command type byte already read

                // Parse command based on its type
                if (spliceCommandType === 0x05) { // Splice Insert
                    spliceCommandInfo = this._parseSpliceInsert(bytes, index, commandEndIndex);
                } else if (spliceCommandType === 0x07) { // Time Signal
                    spliceCommandInfo = this._parseTimeSignal(bytes, index, commandEndIndex);
                } else {
                    // For other command types, just capture the bytes
                    spliceCommandInfo = {
                        raw: Array.from(bytes.slice(index, commandEndIndex + 1))
                    };
                }

                // Move index past the command
                index = commandEndIndex + 1;

                // Parse descriptor loop
                const descriptorLoopLength = (bytes[index] << 8) | bytes[index + 1];
                index += 2;

                const descriptors = [];
                const descriptorEndIndex = index + descriptorLoopLength;

                while (index < descriptorEndIndex) {
                    const descriptorTag = bytes[index++];
                    const descriptorLength = bytes[index++];
                    const descriptorEndPosition = index + descriptorLength;

                    let descriptorInfo = null;

                    if (descriptorTag === 0x02) { // Segmentation Descriptor
                        descriptorInfo = this._parseSegmentationDescriptor(bytes, index, descriptorEndPosition - 1);
                    } else {
                        // For other descriptor types, just capture the bytes
                        descriptorInfo = {
                            raw: Array.from(bytes.slice(index, descriptorEndPosition))
                        };
                    }

                    descriptors.push({
                        tag: descriptorTag,
                        tagName: SCTE35_DESCRIPTOR_TAGS[descriptorTag] || 'unknown',
                        length: descriptorLength,
                        info: descriptorInfo
                    });

                    index = descriptorEndPosition;
                }

                // Skip CRC

                return {
                    tableId,
                    sectionSyntaxIndicator,
                    privateIndicator,
                    sectionLength,
                    protocolVersion,
                    encryptedPacket,
                    encryptionAlgorithm,
                    ptsAdjustment,
                    cwIndex,
                    tier,
                    spliceCommandType,
                    spliceCommandTypeName: SCTE35_COMMAND_TYPES[spliceCommandType] || 'unknown',
                    spliceCommandInfo,
                    descriptorLoopLength,
                    descriptors
                };
            } catch (error) {
                console.error("Error parsing SCTE-35 binary:", error);
                return {
                    error: "Invalid SCTE-35 data: " + error.message,
                    raw: Array.from(bytes)
                };
            }
        },

        // Parse a splice insert command
        _parseSpliceInsert: function (bytes, startIndex, endIndex) {
            let index = startIndex;

            const spliceEventId = (bytes[index] << 24) | (bytes[index + 1] << 16) |
                (bytes[index + 2] << 8) | bytes[index + 3];
            index += 4;

            const spliceEventCancelIndicator = (bytes[index] & 0x80) !== 0;
            index++;

            if (spliceEventCancelIndicator) {
                return {
                    spliceEventId,
                    spliceEventCancelIndicator
                };
            }

            const outOfNetworkIndicator = (bytes[index] & 0x80) !== 0;
            const programSpliceFlag = (bytes[index] & 0x40) !== 0;
            const durationFlag = (bytes[index] & 0x20) !== 0;
            const spliceImmediateFlag = (bytes[index] & 0x10) !== 0;
            index++;

            let spliceTime = null;
            if (programSpliceFlag && !spliceImmediateFlag) {
                spliceTime = this._parseSpliceTime(bytes, index);
                index += (spliceTime.specified ? 5 : 1);
            }

            let breakDuration = null;
            if (durationFlag) {
                breakDuration = this._parseBreakDuration(bytes, index);
                index += 5;
            }

            const uniqueProgramId = (bytes[index] << 8) | bytes[index + 1];
            index += 2;

            const availNum = bytes[index++];
            const availsExpected = bytes[index++];

            return {
                spliceEventId,
                spliceEventCancelIndicator,
                outOfNetworkIndicator,
                programSpliceFlag,
                durationFlag,
                spliceImmediateFlag,
                spliceTime,
                breakDuration,
                uniqueProgramId,
                availNum,
                availsExpected
            };
        },

        // Parse a time signal command
        _parseTimeSignal: function (bytes, startIndex, endIndex) {
            const spliceTime = this._parseSpliceTime(bytes, startIndex);
            return {
                spliceTime
            };
        },

        // Parse splice time
        _parseSpliceTime: function (bytes, index) {
            const timeSpecifiedFlag = (bytes[index] & 0x80) !== 0;

            if (!timeSpecifiedFlag) {
                return {
                    specified: false
                };
            }

            // Read PTS time
            const ptsTime = this._readPTS(bytes.slice(index, index + 5));

            return {
                specified: true,
                ptsTime
            };
        },

        // Parse break duration
        _parseBreakDuration: function (bytes, index) {
            const autoReturn = (bytes[index] & 0x80) !== 0;
            const duration = ((bytes[index] & 0x01) << 32) | (bytes[index + 1] << 24) |
                (bytes[index + 2] << 16) | (bytes[index + 3] << 8) | bytes[index + 4];

            return {
                autoReturn,
                duration
            };
        },

        // Parse segmentation descriptor
        _parseSegmentationDescriptor: function (bytes, startIndex, endIndex) {
            let index = startIndex;

            // Parse identifier
            let identifier = '';
            for (let i = 0; i < 4; i++) {
                identifier += String.fromCharCode(bytes[index++]);
            }

            // Parse event ID
            const eventId = (bytes[index] << 24) | (bytes[index + 1] << 16) |
                (bytes[index + 2] << 8) | bytes[index + 3];
            index += 4;

            // Parse flags
            const cancelIndicator = (bytes[index] & 0x80) !== 0;
            index++;

            if (cancelIndicator) {
                return {
                    identifier,
                    eventId,
                    cancelIndicator
                };
            }

            // Skip reserved bits
            index++;

            // Parse program segmentation flag and segmentation duration flag
            const programSegmentationFlag = (bytes[index] & 0x80) !== 0;
            const segmentationDurationFlag = (bytes[index] & 0x40) !== 0;
            const deliveryNotRestrictedFlag = (bytes[index] & 0x20) !== 0;

            let webDeliveryAllowedFlag = false;
            let noRegionalBlackoutFlag = false;
            let archiveAllowedFlag = false;
            let deviceRestrictions = 0;

            if (!deliveryNotRestrictedFlag) {
                webDeliveryAllowedFlag = (bytes[index] & 0x10) !== 0;
                noRegionalBlackoutFlag = (bytes[index] & 0x08) !== 0;
                archiveAllowedFlag = (bytes[index] & 0x04) !== 0;
                deviceRestrictions = bytes[index] & 0x03;
            }

            index++;

            // Parse segmentation duration if present
            let segmentationDuration = null;
            if (segmentationDurationFlag) {
                segmentationDuration = (bytes[index] << 32) | (bytes[index + 1] << 24) |
                    (bytes[index + 2] << 16) | (bytes[index + 3] << 8) | bytes[index + 4];
                index += 5;
            }

            // Parse upid type and upid
            const upidType = bytes[index++];
            const upidLength = bytes[index++];

            let upid = null;
            if (upidLength > 0) {
                upid = Array.from(bytes.slice(index, index + upidLength));
                index += upidLength;
            }

            // Parse type ID, num and expected
            const typeId = bytes[index++];
            const segmentNum = bytes[index++];
            const segmentsExpected = bytes[index++];

            return {
                identifier,
                eventId,
                cancelIndicator,
                programSegmentationFlag,
                segmentationDurationFlag,
                deliveryNotRestrictedFlag,
                webDeliveryAllowedFlag,
                noRegionalBlackoutFlag,
                archiveAllowedFlag,
                deviceRestrictions,
                segmentationDuration,
                upidType,
                upidLength,
                upid,
                typeId,
                typeIdName: SEGMENTATION_TYPE_IDS[typeId] || 'Unknown',
                segmentNum,
                segmentsExpected,
                isAdStart: this._isAdStartType(typeId),
                isAdEnd: this._isAdEndType(typeId)
            };
        },

        // Check if segmentation type is an ad start
        _isAdStartType: function (typeId) {
            return [0x22, 0x30, 0x32, 0x34, 0x36, 0x38, 0x3A, 0x3C, 0x3E, 0x44, 0x46].includes(typeId);
        },

        // Check if segmentation type is an ad end
        _isAdEndType: function (typeId) {
            return [0x23, 0x31, 0x33, 0x35, 0x37, 0x39, 0x3B, 0x3D, 0x3F, 0x45, 0x47].includes(typeId);
        },

        // Helper to read PTS values
        _readPTS: function (bytes) {
            // PTS is 33 bits, stored in 5 bytes with specific bit patterns
            const byte1 = bytes[0];
            const byte2 = bytes[1];
            const byte3 = bytes[2];
            const byte4 = bytes[3];
            const byte5 = bytes[4];

            // Extract bits according to SCTE-35 spec
            const pts = ((byte1 & 0x0E) << 29) | ((byte2 & 0xFF) << 22) |
                ((byte3 & 0xFE) << 14) | ((byte4 & 0xFF) << 7) |
                ((byte5 & 0xFE) >>> 1);

            return pts;
        },

        // Extract SCTE-35 data from HLS tags
        extractFromHLSTags: function (line) {
            try {
                // Try to extract from DATERANGE tag
                if (line.includes('#EXT-X-DATERANGE')) {
                    const scte35Match = line.match(/SCTE35-OUT=0x([0-9A-F]+)/i) ||
                        line.match(/SCTE35-IN=0x([0-9A-F]+)/i) ||
                        line.match(/SCTE35=0x([0-9A-F]+)/i);

                    if (scte35Match && scte35Match[1]) {
                        const hexData = scte35Match[1];
                        // Convert hex to binary
                        const bytes = new Uint8Array(hexData.length / 2);
                        for (let i = 0; i < hexData.length; i += 2) {
                            bytes[i / 2] = parseInt(hexData.substr(i, 2), 16);
                        }
                        return this.parseFromBytes(bytes);
                    }
                }

                // Try to extract from CUE-OUT tag with base64 data
                if (line.includes('#EXT-X-CUE-OUT') || line.includes('#EXT-X-CUE')) {
                    const base64Match = line.match(/CUE-OUT:([A-Za-z0-9+\/=]+)/) ||
                        line.match(/CUE:([A-Za-z0-9+\/=]+)/);

                    if (base64Match && base64Match[1]) {
                        return this.parseFromB64(base64Match[1]);
                    }
                }

                // Try to extract from CUE-OUT tag with SCTE-35 attribute
                if (line.includes('SCTE35=')) {
                    const base64Match = line.match(/SCTE35=([A-Za-z0-9+\/=]+)/);

                    if (base64Match && base64Match[1]) {
                        return this.parseFromB64(base64Match[1]);
                    }
                }

                return null;
            } catch (error) {
                console.error("Error extracting SCTE-35 from HLS tag:", error);
                return null;
            }
        },

        // Get a human-readable description of a SCTE-35 signal
        getHumanReadableDescription: function (parsedScte35) {
            if (!parsedScte35 || parsedScte35.error) {
                return "Invalid SCTE-35 signal";
            }

            let description = `SCTE-35 ${parsedScte35.spliceCommandTypeName || 'unknown'} command`;

            // For splice insert
            if (parsedScte35.spliceCommandType === 0x05 && parsedScte35.spliceCommandInfo) {
                const info = parsedScte35.spliceCommandInfo;

                if (info.spliceEventCancelIndicator) {
                    return `${description}: Cancel splice event ID ${info.spliceEventId}`;
                }

                description += info.outOfNetworkIndicator ? ": OUT (Ad Start)" : ": IN (Ad End)";

                if (info.spliceImmediateFlag) {
                    description += " - Immediate";
                } else if (info.spliceTime && info.spliceTime.specified) {
                    description += ` - At PTS ${info.spliceTime.ptsTime}`;
                }

                if (info.breakDuration) {
                    const durationSecs = info.breakDuration.duration / 90000; // Convert from 90kHz to seconds
                    description += ` - Duration: ${durationSecs.toFixed(1)}s`;
                }
            }

            // For time signal with segmentation descriptor
            if (parsedScte35.spliceCommandType === 0x07 && parsedScte35.descriptors.length > 0) {
                const segmentationDescriptors = parsedScte35.descriptors.filter(d => d.tag === 0x02);

                if (segmentationDescriptors.length > 0) {
                    const segDesc = segmentationDescriptors[0].info;

                    if (segDesc.cancelIndicator) {
                        return `${description}: Cancel segmentation event ID ${segDesc.eventId}`;
                    }

                    if (segDesc.typeIdName) {
                        description += `: ${segDesc.typeIdName}`;
                    }

                    if (segDesc.isAdStart) {
                        description += " (Ad Start)";
                    } else if (segDesc.isAdEnd) {
                        description += " (Ad End)";
                    }

                    if (segDesc.segmentationDuration) {
                        const durationSecs = segDesc.segmentationDuration / 90000; // Convert from 90kHz to seconds
                        description += ` - Duration: ${durationSecs.toFixed(1)}s`;
                    }
                }
            }

            return description;
        }
    };

    // Export the SCTE35 parser
    window.SCTE35Parser = SCTE35Parser;

    // --- SCTE Manager Logic ---

    // ---> ADD STATE FOR DISCONTINUITY TRACKING <---
    let discontinuityCount = 0;
    let lastDiscontinuityTime = 0;
    // ---> END STATE <---

    // --- State ---
    let hlsInstance = null;
    const scteSignals = []; // Array to store detected signals { timestamp, source, parsedData, description, rawLine/Payload }
    let signalCounter = 0; // Simple counter for unique IDs

    // --- DOM Elements ---
    let scteDisplayEl = null;
    let scteDetailContainerEl = null;
    let scteTimelineEl = null;
    // Add refs for Ad Ratio graph elements if you want to keep updating them from here
    let adRatioGraphEl = null;
    let adRatioEl = null;
    let adCountEl = null;

    // --- Initialization ---
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        console.log('[scte_manager] DOM ready.');
        scteDisplayEl = document.getElementById('scteDisplay');
        scteDetailContainerEl = document.getElementById('scteDetailContainer');
        scteTimelineEl = document.getElementById('scteTimeline');
        adRatioGraphEl = document.getElementById('adRatioGraph'); // Optional
        adRatioEl = document.getElementById('adRatio');           // Optional
        adCountEl = document.getElementById('adCount');         // Optional

        if (!scteDisplayEl || !scteDetailContainerEl || !scteTimelineEl) {
            console.warn('[scte_manager] Required SCTE UI elements not found. SCTE display disabled.');
            return; // Don't proceed if basic elements are missing
        }

        // ---> Ensure details start visible <---
        if (scteDetailContainerEl) scteDetailContainerEl.style.display = 'block';

        resetState(); // Initial reset

        // Listen for events
        document.addEventListener('hlsPlaylistParsed', handleHlsPlaylistParsed);
        document.addEventListener('hlsLoaded', handleHlsLoaded);
        document.addEventListener('newStreamLoading', resetState); // Listen for stream resets
        document.addEventListener('hlsDiscontinuityDetected', handleDiscontinuity);

        console.log('[scte_manager] Initialized and listening for HLS events.');
    }

    function resetState() {
        console.log('[scte_manager] Resetting SCTE state.');
        scteSignals.length = 0; // Clear the array
        signalCounter = 0;
        // Reset UI
        if (scteDisplayEl) scteDisplayEl.innerHTML = "No SCTE-35 markers detected";
        if (scteDetailContainerEl) {
            scteDetailContainerEl.innerHTML = '<div class="scte-detail-empty">No SCTE-35 signals decoded yet</div>';
            scteDetailContainerEl.style.display = 'block';
        }
        if (scteTimelineEl) scteTimelineEl.innerHTML = '';
        discontinuityCount = 0; // <<< RESET COUNT
        lastDiscontinuityTime = 0; // <<< RESET TIME
        updateAdStatsDisplay(); // Reset ad stats display if kept
        // Optional: Reset Ad Ratio Graph canvas if kept
        if (adRatioGraphEl && adRatioGraphEl.getContext) {
            const ctx = adRatioGraphEl.getContext('2d');
            ctx.clearRect(0, 0, adRatioGraphEl.width, adRatioGraphEl.height);
            ctx.fillStyle = '#999'; ctx.font = '10px Arial'; ctx.textAlign = 'center';
            ctx.fillText('No ad data', adRatioGraphEl.width / 2, adRatioGraphEl.height / 2);
        }
    }

    // --- Event Handlers ---

    function handleHlsLoaded(event) {
        if (event.detail.hls && !hlsInstance) { // Process only once
            console.log('[scte_manager] HLS instance loaded. Attaching metadata listener.');
            hlsInstance = event.detail.hls;
            // Listen for ID3 metadata parsed from fragments
            // hlsInstance.on(Hls.Events.FRAG_PARSING_METADATA, handleFragMetadata);
        }
    }

    function handleHlsPlaylistParsed(event) {
        // Process SCTE tags found directly in manifest text
        const { type, content, url } = event.detail;
        if (!content) return;

        console.log(`[scte_manager] Processing playlist content (${type}) for manifest SCTE tags: ${url}`);
        const lines = content.split('\n');
        lines.forEach(line => {
            const trimmedLine = line.trim();
            // Use the parser's extraction logic
            const parsedData = SCTE35Parser.extractFromHLSTags(trimmedLine);
            if (parsedData) {
                console.log('[scte_manager] Found SCTE in manifest line:', trimmedLine, 'Parsed:', parsedData);
                addScteSignal({
                    source: 'manifest',
                    rawLine: trimmedLine, // Store the original tag line
                    parsedData: parsedData,
                    // Timestamp might be tricky from manifest alone, use current time
                    timestamp: Date.now()
                });
            }
        });
    }

    // ---> ADD NEW DISCONTINUITY HANDLER <---
    function handleDiscontinuity(event) {
        const segment = event.detail.segment;
        if (!segment) return;

        console.log(`[scte_manager] Discontinuity detected before segment: ${segment.id}, Seq: ${segment.sequence}, URL: ${segment.url}`);
        discontinuityCount++;
        const now = Date.now(); // Use wall clock time for heuristic ordering

        // Heuristic: Alternate Ad Start/End based on count
        // Assumes discontinuities reliably mark both start AND end of breaks.
        const markerType = (discontinuityCount % 2 !== 0) ? 'ad-start' : 'ad-end';
        const description = `Discontinuity marker (heuristic: ${markerType})`;
        const duration = (markerType === 'ad-start') ? 30 : 0; // Assume 30s ad if start detected this way

        console.log(`[scte_manager] Heuristic assigned type: ${markerType}`);

        // Add this as a *basic* signal (no detailed SCTE data parsed)
        addScteSignal({
            source: 'discontinuity',
            timestamp: now, // Or segment.programDateTime if available and reliable
            parsedData: { // Create a minimal "parsed" object for consistency
                spliceCommandTypeName: 'Discontinuity Signal',
                isHeuristic: true, // Add flag to indicate it's inferred
                heuristicType: markerType
            },
            description: description,
            rawLine: `#EXT-X-DISCONTINUITY (before seq ${segment.sequence})` // Reference the source
        });

        // Update last discontinuity time for potential future advanced heuristics
        lastDiscontinuityTime = now;
    }
    // ---> END NEW HANDLER <---


    // --- Data Handling ---
    function addScteSignal(signalData) {
        signalCounter++;
        const newSignal = {
            id: `scte_${signalCounter}`,
            timestamp: signalData.timestamp || Date.now(), // Wall clock if specific PTS unavailable
            source: signalData.source, // 'manifest' or 'id3'
            rawLine: signalData.rawLine, // Original HLS tag if from manifest
            payload: signalData.payload, // Raw bytes if from ID3
            parsedData: signalData.parsedData,
            description: signalData.description || SCTE35Parser.getHumanReadableDescription(signalData.parsedData)
        };

        // Basic duplicate check (can be enhanced based on eventId, PTS etc.)
        const isDuplicate = scteSignals.some(existing =>
            // Don't add identical discontinuities too close together
            (existing.source === 'discontinuity' && newSignal.source === 'discontinuity' && Math.abs(existing.timestamp - newSignal.timestamp) < 2000) ||
            // Or identical parsed SCTE data too close together
            (existing.parsedData && newSignal.parsedData && !existing.parsedData.isHeuristic && !newSignal.parsedData.isHeuristic && JSON.stringify(existing.parsedData) === JSON.stringify(newSignal.parsedData) && Math.abs(existing.timestamp - newSignal.timestamp) < 1000)
        );

        if (!isDuplicate) {
            scteSignals.push(newSignal);
            console.log('[scte_manager] Added new SCTE signal:', newSignal);
            updateScteSummaryDisplay();
            updateScteDetailDisplay();
            updateScteTimeline();
            updateAdStatsDisplay();
        } else {
            console.log('[scte_manager] Skipping duplicate SCTE signal:', newSignal);
        }
    }

    // --- UI Update Functions ---

    // Updates the main summary display (#scteDisplay)
    function updateScteSummaryDisplay() {
        if (!scteDisplayEl) return;

        if (scteSignals.length === 0) {
            scteDisplayEl.innerHTML = "No SCTE-35 markers detected";
            return;
        }

        // Example: Show count and last signal type
        const lastSignal = scteSignals[scteSignals.length - 1];
        let summaryHtml = `<div class="scte-info">
            <span>Total Signals:</span>
            <span class="scte-value">${scteSignals.length}</span>
        </div>`;

        if (lastSignal) {
             // ---> IMPROVE LAST SIGNAL TEXT <---
             let lastSignalText = "Unknown";
             if (lastSignal.parsedData?.isHeuristic) {
                 // More user-friendly text for heuristic signals
                 lastSignalText = `${lastSignal.parsedData.heuristicType === 'ad-start' ? 'Ad Start' : 'Ad End'} (Detected via Discontinuity)`;
             } else if (lastSignal.description) {
                 // Use description for parsed SCTE
                 lastSignalText = lastSignal.description;
             }
             summaryHtml += `<div class="scte-info">
                <span>Last Signal:</span>
                <span class="scte-value">${lastSignalText}</span>
            </div>`;
             // ---> END IMPROVEMENT <---
        }
        scteDisplayEl.innerHTML = summaryHtml;
    }

    // Updates the detailed list (#scteDetailContainer)
    function updateScteDetailDisplay() {
        if (!scteDetailContainerEl) {
            console.error("[scte_manager] Cannot update SCTE details: Detail container element not found.");
            return; // Cannot proceed
        }

        if (scteSignals.length === 0) {
            // Display the empty message if no signals have been detected yet
            scteDetailContainerEl.innerHTML = '<div class="scte-detail-empty">No SCTE-35 signals decoded yet</div>';
            return;
        }

        // Get the signals, reverse for most recent first
        const recentSignals = scteSignals.slice().reverse();
        scteDetailContainerEl.innerHTML = ''; // Clear previous details

        // Process each signal
        recentSignals.forEach(signal => {
            const parsed = signal.parsedData;

            // Create the main container for this signal entry
            const signalEl = document.createElement('div');
            signalEl.className = 'scte-signal'; // Base class

            // Create common elements
            const headerEl = document.createElement('div');
            headerEl.className = 'scte-signal-header';
            const sourceEl = document.createElement('div');
            sourceEl.className = 'scte-signal-source';
            sourceEl.textContent = `Source: ${signal.source} @ ${new Date(signal.timestamp).toLocaleTimeString()}`;
            if (signal.rawLine) { // Add raw line if available (from manifest/discontinuity)
                sourceEl.textContent += ` (${signal.rawLine.trim()})`;
            }

            // --- Display Logic based on signal type ---

            if (parsed && parsed.isHeuristic) {
                // --- Display Heuristic Signal (Discontinuity) ---
                const heuristicType = parsed.heuristicType || 'unknown'; // ad-start or ad-end
                signalEl.classList.add(heuristicType); // Add class for color coding
                headerEl.textContent = `Heuristic: ${heuristicType === 'ad-start' ? 'Ad Start' : 'Ad End'}`;

                signalEl.appendChild(headerEl);
                // No detailed SCTE data for heuristics
                signalEl.appendChild(sourceEl); // Add source/time

            } else if (parsed && !parsed.error) {
                // --- Display Fully Parsed SCTE Signal ---
                let header = `${parsed.spliceCommandTypeName || 'Unknown Command'}`;
                let details = '';
                let typeClass = ''; // For ad-start/ad-end color coding

                // Build details based on command type
                if (parsed.spliceCommandType === 0x05 && parsed.spliceCommandInfo) { // Splice Insert
                    const info = parsed.spliceCommandInfo;
                    header += ` (ID: ${info.spliceEventId || 'N/A'})`;
                    typeClass = info.outOfNetworkIndicator ? 'ad-start' : 'ad-end';
                    details += ` Out: ${info.outOfNetworkIndicator}, Prog Splice: ${info.programSpliceFlag}, Duration: ${info.durationFlag}, Immediate: ${info.spliceImmediateFlag}`;
                    if (info.spliceTime?.specified) details += `, PTS: ${formatScteTime(info.spliceTime.ptsTime)}`;
                    if (info.breakDuration) details += `, Break Dur: ${formatScteTime(info.breakDuration.duration)} (${(info.breakDuration.duration / 90000).toFixed(1)}s)`;
                } else if (parsed.spliceCommandType === 0x07 && parsed.spliceCommandInfo) { // Time Signal
                    const info = parsed.spliceCommandInfo;
                    if (info.spliceTime?.specified) header += ` at PTS ${formatScteTime(info.spliceTime.ptsTime)}`;
                    // Time signals often contain segmentation descriptors which determine ad status
                }
                // Add other command type parsing here if needed...


                // Add details from Segmentation Descriptors (Common for Time Signals and Splice Inserts)
                const segDesc = parsed.descriptors?.find(d => d.tag === 0x02)?.info;
                if (segDesc) {
                    if (!segDesc.cancelIndicator) {
                        header += ` | Seg Type: ${segDesc.typeId} (${segDesc.typeIdName || 'Unknown'})`;
                        // Determine ad start/end primarily from segmentation descriptor if present
                        if (segDesc.isAdStart) typeClass = 'ad-start';
                        else if (segDesc.isAdEnd) typeClass = 'ad-end'; // Use else if to avoid override

                        details += ` | Seg Event ID: ${segDesc.eventId || 'N/A'}, Num: ${segDesc.segmentNum}, Expected: ${segDesc.segmentsExpected}`;
                        if (segDesc.segmentationDuration !== null) details += `, Seg Dur: ${formatScteTime(segDesc.segmentationDuration)} (${(segDesc.segmentationDuration / 90000).toFixed(1)}s)`;
                        if (segDesc.upid) details += `, UPID (${segDesc.upidType}): ${formatUpid(segDesc.upid)}`;
                    } else {
                        header += ` | Cancel Seg Event ID: ${segDesc.eventId || 'N/A'}`;
                    }
                }

                signalEl.classList.add(typeClass); // Add class based on final analysis

                headerEl.textContent = header; // Set the built header text

                signalEl.appendChild(headerEl); // Add header

                // Add details only if some were generated
                if (details.trim()) {
                    const detailsEl = document.createElement('div');
                    detailsEl.className = 'scte-signal-details';
                    // Clean up leading separators from potentially concatenated string
                    detailsEl.textContent = details.trim().replace(/^\|\s*/, '');
                    signalEl.appendChild(detailsEl);
                }

                signalEl.appendChild(sourceEl); // Add source/time

            } else {
                // --- Handle Signals with Parsing Errors or Missing Parsed Data ---
                console.warn("[scte_manager] Skipping display of signal with parsing error or missing parsed data:", signal);
                // Optionally display a basic error entry:
                headerEl.textContent = `Error Processing Signal`;
                headerEl.style.color = 'orange'; // Indicate warning/error
                const errorDetailsEl = document.createElement('div');
                errorDetailsEl.className = 'scte-signal-details';
                errorDetailsEl.textContent = parsed?.error || 'Could not parse data.';
                signalEl.appendChild(headerEl);
                signalEl.appendChild(errorDetailsEl);
                signalEl.appendChild(sourceEl);
            }

            // Append the fully constructed element for this signal
            scteDetailContainerEl.appendChild(signalEl);

        }); // End forEach loop
    }


    // Updates the simple timeline (#scteTimeline)
    function updateScteTimeline() {
        if (!scteTimelineEl || !hlsInstance || !hlsInstance.media) return;
        const videoDuration = hlsInstance.media.duration;
        if (!videoDuration || !isFinite(videoDuration)) return; // Need video duration

        scteTimelineEl.innerHTML = ''; // Clear existing markers

        scteSignals.forEach(signal => {
            const parsed = signal.parsedData;
            if (!parsed || parsed.error) return;

            // Try to get a meaningful time point (PTS)
            let signalTimeSeconds = -1;
            if (parsed.spliceCommandInfo?.spliceTime?.specified) {
                signalTimeSeconds = parsed.spliceCommandInfo.spliceTime.ptsTime / 90000;
            } // Add logic here to potentially use ID3 PTS if available and relevant

            if (signalTimeSeconds >= 0 && signalTimeSeconds <= videoDuration) {
                const positionPercent = (signalTimeSeconds / videoDuration) * 100;

                let typeClass = '';
                if (parsed.spliceCommandInfo?.outOfNetworkIndicator) typeClass = 'ad-start';
                if (parsed.descriptors?.find(d => d.tag === 0x02)?.info?.isAdStart) typeClass = 'ad-start';
                if (parsed.descriptors?.find(d => d.tag === 0x02)?.info?.isAdEnd) typeClass = 'ad-end';
                // Add more logic if needed for other types

                const markerEl = document.createElement('div');
                markerEl.className = `scte-marker-point ${typeClass}`;
                markerEl.style.left = `${positionPercent}%`;
                markerEl.title = signal.description || 'SCTE-35 Signal';
                scteTimelineEl.appendChild(markerEl);
            }
        });
    }


    // Updates the Ad Ratio / Ad Count display (Optional: Can be removed if not needed)
    function updateAdStatsDisplay() {
        if (!adRatioEl || !adCountEl) return;

        // Basic example: just count signals classified as ad-start
        // More complex logic needed for accurate duration/ratio tracking
        const adStarts = scteSignals.filter(s => {
            const parsed = s.parsedData;
            if (!parsed) return false;
            if (parsed.isHeuristic) return parsed.heuristicType === 'ad-start'; // Count heuristic starts
            if (parsed.spliceCommandInfo?.outOfNetworkIndicator) return true;
            if (parsed.descriptors?.find(d => d.tag === 0x02)?.info?.isAdStart) return true;
            return false;
        }).length;

        adCountEl.textContent = `Ads: ${adStarts}`;
        adRatioEl.textContent = `Ad Ratio: N/A`; // Accurate ratio requires duration tracking
        // TODO: Implement duration tracking for accurate ratio if needed
    }

    // --- Utility Functions ---
    // Make toggle function global for onclick handler
    window.toggleScteDetails = function (event) {
        if (event) event.preventDefault();
        if (scteDetailContainerEl) {
            scteDetailContainerEl.style.display = (scteDetailContainerEl.style.display === 'none') ? 'block' : 'none';
            // Optional: Change link text
            // const toggleLink = document.querySelector('.scte-detail-toggle');
            // if(toggleLink) toggleLink.textContent = scteDetailContainerEl.style.display === 'none' ? 'Show Details' : 'Hide Details';
        }
    };

    // Simple PTS time formatter (seconds.milliseconds)
    function formatScteTime(pts) {
        if (pts === undefined || pts === null) return 'N/A';
        const seconds = pts / 90000;
        return seconds.toFixed(3); // Show 3 decimal places
    }
    // Simple UPID formatter
    function formatUpid(upidBytes) {
        if (!upidBytes) return 'N/A';
        // Example: Convert byte array to hex string
        return upidBytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
    }


})(); // IIFE closes