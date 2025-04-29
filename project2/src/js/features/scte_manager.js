// js/features/scte_manager.js
// Manages SCTE-35 signal detection, parsing, and display from HLS manifests and potentially other sources.

console.log('[scte_manager] Initializing...');

(function () { // IIFE to encapsulate logic

    // --- Constants ---

    // SCTE-35 command types (Table 8)
    const SCTE35_COMMAND_TYPES = {
        0x00: 'null',
        0x05: 'splice_insert',
        0x06: 'splice_schedule',
        0x07: 'splice_time_signal',
        0xFE: 'bandwidth_reservation',
        0xFF: 'private_command'
        // Note: 0x255 (time_signal in some contexts) is technically mapped to 0xFF (private_command) in base spec
    };

    // SCTE-35 descriptor tags (Table 15)
    const SCTE35_DESCRIPTOR_TAGS = {
        0x00: 'avail_descriptor',
        0x01: 'dtmf_descriptor',
        0x02: 'segmentation_descriptor',
        0x03: 'time_descriptor',
        0x04: 'audio_descriptor'
    };

    // SCTE-35 Segmentation type IDs (Table 17)
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
        0x42: 'Alternative Content Opportunity Start', // Deprecated but might appear
        0x43: 'Alternative Content Opportunity End',   // Deprecated
        0x44: 'Network Advertisement Start',          // Added in SCTE 2016+
        0x45: 'Network Advertisement End',            // Added in SCTE 2016+
        0x46: 'Network Placement Opportunity Start',  // Added in SCTE 2022
        0x47: 'Network Placement Opportunity End',    // Added in SCTE 2022
        0x50: 'Network Signal Start',                 // Added in SCTE 2016+
        0x51: 'Network Signal End'                    // Added in SCTE 2016+
        // Note: Additional types exist in newer SCTE-35 versions
    };

    // Set of Type IDs considered as Ad Starts
    const AD_START_TYPE_IDS = new Set([
        0x22, // Break Start
        0x30, // Provider Advertisement Start
        0x32, // Distributor Advertisement Start
        0x34, // Provider Placement Opportunity Start
        0x36, // Distributor Placement Opportunity Start
        0x38, // Provider Overlay Placement Opportunity Start
        0x3A, // Distributor Overlay Placement Opportunity Start
        0x3C, // Provider Promo Start
        0x3E, // Distributor Promo Start
        0x44, // Network Advertisement Start (SCTE 2016+)
        0x46, // Network Placement Opportunity Start (SCTE 2022)
        0x50  // Network Signal Start (Often used for ad avail boundaries)
    ]);

    // Set of Type IDs considered as Ad Ends
    const AD_END_TYPE_IDS = new Set([
        0x23, // Break End
        0x31, // Provider Advertisement End
        0x33, // Distributor Advertisement End
        0x35, // Provider Placement Opportunity End
        0x37, // Distributor Placement Opportunity End
        0x39, // Provider Overlay Placement Opportunity End
        0x3B, // Distributor Overlay Placement Opportunity End
        0x3D, // Provider Promo End
        0x3F, // Distributor Promo End
        0x45, // Network Advertisement End (SCTE 2016+)
        0x47, // Network Placement Opportunity End (SCTE 2022)
        0x51  // Network Signal End (Often used for ad avail boundaries)
    ]);

    // Regex for detecting ad-related paths in URLs (case-insensitive)
    const AD_URL_REGEX = /\/(?:creatives?|ads?|dai)\//i; // Added 'creative', 'dai'

    // Regex patterns for extracting SCTE data from HLS tags
    const HLS_TAG_REGEX = {
        // #EXT-X-DATERANGE with SCTE35-OUT, SCTE35-IN, or SCTE35 (Hex)
        DATERANGE_SCTE35_HEX: /#EXT-X-DATERANGE:(?:[^,]+,)?SCTE35-(?:OUT|IN)=(0x[0-9A-F]+)/i,
        DATERANGE_SCTE35_ATTR_HEX: /#EXT-X-DATERANGE:(?:[^,]+,)?SCTE35=(0x[0-9A-F]+)/i,
        // #EXT-X-CUE / #EXT-X-CUE-OUT with Base64 payload
        CUE_OUT_B64: /#EXT-X-CUE-OUT:([A-Za-z0-9+\/=]+)/,
        CUE_GENERIC_B64: /#EXT-X-CUE:([A-Za-z0-9+\/=]+)/,
        // Generic tags with SCTE35 attribute (Base64 or Hex)
        ATTR_SCTE35_B64: /SCTE35=([A-Za-z0-9+\/=]+)/,
        ATTR_SCTE35_HEX: /SCTE35=(0x[0-9A-F]+)/i,
        // Other common attributes holding SCTE data (Base64)
        ATTR_SIGNAL_B64: /SIGNAL=([A-Za-z0-9+\/=]+)/,
        ATTR_MARKER_B64: /MARKER=([A-Za-z0-9+\/=]+)/,
        // Generic #EXT-SCTE35: or #EXT-X-SCTE35: style tags (Base64 or Hex)
        EXT_SCTE35_TAG: /#EXT-(?:X-)?SCTE(?:-?35)?:([^,\s]+)/
    };

    // --- SCTE-35 Parser ---
    const SCTE35Parser = {
        // Parse SCTE-35 Base64 encoded data
        parseFromB64: function (base64Data) {
            if (!base64Data || typeof base64Data !== 'string') {
                return { error: "Invalid Base64 input: not a string or empty", raw: base64Data };
            }
            try {
                const binary = atob(base64Data);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                return this.parseFromBytes(bytes);
            } catch (error) {
                // Catch DOMException specifically for invalid Base64
                if (error instanceof DOMException && error.name === 'InvalidCharacterError') {
                    console.warn("Failed Base64 decoding for SCTE-35:", base64Data, error.message);
                    return { error: "Invalid base64 encoding characters", raw: base64Data };
                }
                console.error("Error parsing SCTE-35 base64:", error, "Data:", base64Data);
                return { error: `Base64 parsing error: ${error.message}`, raw: base64Data };
            }
        },

        // Parse SCTE-35 Hex encoded data (handles '0x' prefix)
        parseFromHex: function(hexData) {
            if (!hexData || typeof hexData !== 'string') {
                 return { error: "Invalid Hex input: not a string or empty", raw: hexData };
            }
            const cleanHex = hexData.startsWith('0x') ? hexData.substring(2) : hexData;
            if (cleanHex.length % 2 !== 0 || !/^[0-9A-F]+$/i.test(cleanHex)) {
                 return { error: "Invalid hex encoding format", raw: hexData };
            }
            try {
                const bytes = new Uint8Array(cleanHex.length / 2);
                for (let i = 0; i < cleanHex.length; i += 2) {
                    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
                }
                return this.parseFromBytes(bytes);
            } catch (error) {
                 console.error("Error parsing SCTE-35 hex:", error, "Data:", hexData);
                 return { error: `Hex parsing error: ${error.message}`, raw: hexData };
            }
        },

        // Parse SCTE-35 binary data (Uint8Array)
        parseFromBytes: function (bytes) {
            if (!bytes || !(bytes instanceof Uint8Array) || bytes.length < 15) { // Minimum length check (header fields)
                 return { error: "Invalid SCTE-35 binary data: too short or wrong type", raw: Array.from(bytes || []) };
            }
            try {
                let index = 0;

                const tableId = bytes[index++];
                // Table ID must be 0xFC for splice_info_section()
                if (tableId !== 0xFC) {
                    return { error: `Not a valid SCTE-35 message (Table ID is 0x${tableId.toString(16)}, expected 0xFC)` };
                }

                const sectionSyntaxIndicator = (bytes[index] & 0x80) !== 0;
                const privateIndicator = (bytes[index] & 0x40) !== 0;
                // Bits 0x30 are reserved
                const sectionLength = ((bytes[index] & 0x0F) << 8) | bytes[index + 1];
                index += 2;

                // Check if provided byte array length matches section_length
                // sectionLength includes bytes after section_length field itself up to but not including CRC_32
                // Expected length = 3 (table_id + section_syntax + section_length fields) + sectionLength
                // However, the CRC_32 (4 bytes) might or might not be included in the input 'bytes'.
                // SCTE-35 spec says sectionLength is "number of bytes of the section, starting immediately following the section_length field, and including the CRC_32"
                // So, total length including CRC should be 3 + sectionLength.
                // We parse up to the end of descriptors, so the minimum expected index is before CRC.
                const expectedDataLength = sectionLength - 4; // Section length excluding CRC
                const headerLength = 11; // Fields before command/descriptors loop starts
                if (bytes.length < headerLength + expectedDataLength && bytes.length !== 3 + sectionLength) {
                    // Allow full length if CRC is present, otherwise check minimum needed data
                     console.warn(`[scte_manager] SCTE-35 length mismatch. section_length=${sectionLength}, bytes received=${bytes.length}. Parsing might be incomplete.`);
                    // We can still attempt parsing, but it might fail later
                }


                const protocolVersion = bytes[index++]; // Should be 0
                const encryptedPacket = (bytes[index] & 0x80) !== 0; // MSB of encryption_algorithm is encryption flag
                const encryptionAlgorithm = (bytes[index] >> 1) & 0x3F; // 6 bits for algorithm
                // LSB reserved
                index++;

                const ptsAdjustment = this._readPTS(bytes, index); // Use index directly
                index += 5;

                const cwIndex = bytes[index++];

                const tier = (bytes[index] << 4) | (bytes[index + 1] >> 4); // 12 bits
                index++;
                const spliceCommandLength = ((bytes[index] & 0x0F) << 8) | bytes[index + 1];
                index += 1; // Increment index by 1 here, next byte is part of length

                index++; // Move past the second byte of splice_command_length


                let spliceCommandType = null;
                let spliceCommandInfo = null;
                let commandEndIndex = index + spliceCommandLength; // End index is start + length

                if (spliceCommandLength === 0xFFF) { // No command defined
                     spliceCommandType = null;
                     commandEndIndex = index; // No command bytes to read
                } else if (spliceCommandLength > 0) {
                    if (index >= bytes.length) return { error: "Invalid SCTE-35 data: splice_command_length indicates data but buffer ends", raw: Array.from(bytes)};
                    spliceCommandType = bytes[index++];
                    if(index > commandEndIndex) return { error: "Invalid SCTE-35 data: Command length too small for command type byte", raw: Array.from(bytes)};

                    switch (spliceCommandType) {
                        case 0x05: // Splice Insert
                            spliceCommandInfo = this._parseSpliceInsert(bytes, index, commandEndIndex);
                            break;
                        case 0x07: // Time Signal
                             spliceCommandInfo = this._parseTimeSignal(bytes, index, commandEndIndex);
                            break;
                        // TODO: Add parsers for other command types (0x00, 0x06, 0xFE, 0xFF) if needed
                        default:
                            console.warn(`[scte_manager] Unsupported SCTE-35 command type: 0x${spliceCommandType.toString(16)}`);
                            spliceCommandInfo = { raw: Array.from(bytes.slice(index, commandEndIndex)) };
                            break;
                    }
                     // Check for parsing errors within command parsers
                     if (spliceCommandInfo && spliceCommandInfo.error) {
                         return { ...spliceCommandInfo, context: `Parsing command type 0x${spliceCommandType.toString(16)}`, raw: Array.from(bytes) };
                     }
                } else {
                    // splice_command_length is 0, legacy handling? SCTE-35 2019 implies it should be 0xFFF if no command.
                    spliceCommandType = null;
                }

                // Move index past the command
                index = commandEndIndex;

                if (index + 2 > bytes.length) return { error: "Invalid SCTE-35 data: buffer ends before descriptor_loop_length", raw: Array.from(bytes)};

                const descriptorLoopLength = (bytes[index] << 8) | bytes[index + 1];
                index += 2;

                const descriptors = [];
                const descriptorEndIndex = index + descriptorLoopLength;

                if (descriptorEndIndex > bytes.length) {
                    console.warn(`[scte_manager] Descriptor loop length (${descriptorLoopLength}) exceeds available bytes (${bytes.length - index}). Truncating.`);
                    // Attempt to parse what's available, but mark as potentially incomplete.
                }

                while (index < descriptorEndIndex && index + 2 <= bytes.length) { // Need at least tag and length
                    const descriptorTag = bytes[index++];
                    const descriptorLength = bytes[index++];
                    const descriptorDataEndIndex = index + descriptorLength;

                    if (descriptorDataEndIndex > bytes.length) {
                         console.warn(`[scte_manager] Descriptor tag 0x${descriptorTag.toString(16)} length (${descriptorLength}) exceeds available bytes. Stopping descriptor parse.`);
                         break; // Stop parsing descriptors if one goes out of bounds
                    }

                    let descriptorInfo = null;
                    switch (descriptorTag) {
                        case 0x02: // Segmentation Descriptor
                             descriptorInfo = this._parseSegmentationDescriptor(bytes, index, descriptorDataEndIndex -1); // endIndex is inclusive
                             break;
                        // TODO: Add parsers for other descriptor types (0x00, 0x01, 0x03, 0x04) if needed
                        default:
                            console.warn(`[scte_manager] Unsupported SCTE-35 descriptor tag: 0x${descriptorTag.toString(16)}`);
                            descriptorInfo = { raw: Array.from(bytes.slice(index, descriptorDataEndIndex)) };
                            break;
                    }

                    // Check for parsing errors within descriptor parsers
                    if (descriptorInfo && descriptorInfo.error) {
                         return { ...descriptorInfo, context: `Parsing descriptor tag 0x${descriptorTag.toString(16)}`, raw: Array.from(bytes) };
                    }

                    descriptors.push({
                        tag: descriptorTag,
                        tagName: SCTE35_DESCRIPTOR_TAGS[descriptorTag] || 'unknown',
                        length: descriptorLength,
                        info: descriptorInfo
                    });

                    index = descriptorDataEndIndex; // Move index past this descriptor's data
                }

                // We don't parse the CRC_32 at the end (4 bytes)

                return {
                    tableId: `0x${tableId.toString(16).toUpperCase()}`,
                    sectionSyntaxIndicator,
                    privateIndicator,
                    sectionLength,
                    protocolVersion,
                    encryptedPacket,
                    encryptionAlgorithm,
                    ptsAdjustment,
                    cwIndex: `0x${cwIndex.toString(16).toUpperCase()}`,
                    tier: `0x${tier.toString(16).toUpperCase()}`,
                    spliceCommandLength: spliceCommandLength === 0xFFF ? 'Not Provided' : spliceCommandLength,
                    spliceCommandType: spliceCommandType !== null ? `0x${spliceCommandType.toString(16).toUpperCase()}` : null,
                    spliceCommandTypeName: spliceCommandType !== null ? (SCTE35_COMMAND_TYPES[spliceCommandType] || 'unknown') : null,
                    spliceCommandInfo,
                    descriptorLoopLength,
                    descriptors
                };
            } catch (error) {
                console.error("Error parsing SCTE-35 binary:", error);
                return {
                    error: `Binary parsing error: ${error.message}`,
                    raw: Array.from(bytes || []) // Ensure raw is always an array
                };
            }
        },

        // Parse a splice insert command (0x05)
        _parseSpliceInsert: function (bytes, startIndex, endIndex) {
            let index = startIndex;
            const expectedMinLength = 5; // event_id (4) + flags (1)
            if (endIndex < startIndex + expectedMinLength -1) return { error: "Insufficient data for splice_insert command basic fields" };

            const spliceEventId = (bytes[index++] << 24) | (bytes[index++] << 16) | (bytes[index++] << 8) | bytes[index++];
            const spliceEventCancelIndicator = (bytes[index] & 0x80) !== 0;
            // 7 reserved bits
            index++;

            if (spliceEventCancelIndicator) {
                // If cancelled, the rest of the fields are not present
                 if (index !== endIndex + 1) console.warn("[scte_manager] Extra data found after splice_event_cancel_indicator");
                return { spliceEventId, spliceEventCancelIndicator };
            }

            const expectedMinLengthNotCancelled = expectedMinLength + 5; // adds flags(1), component_count/splice_time(1/5), duration(5), prog_id(2), avail(1), avails(1) - simplified min
             if (endIndex < startIndex + expectedMinLengthNotCancelled - 1 - 5 - 5) { // Rough check, complexity due to flags
                 // No hard error, but warn, actual checks follow
                 console.warn("[scte_manager] Potential insufficient data for non-cancelled splice_insert fields");
             }

            const outOfNetworkIndicator = (bytes[index] & 0x80) !== 0;
            const programSpliceFlag = (bytes[index] & 0x40) !== 0;
            const durationFlag = (bytes[index] & 0x20) !== 0;
            const spliceImmediateFlag = (bytes[index] & 0x10) !== 0;
            // 4 reserved bits
            index++;

            let spliceTime = null;
            if (programSpliceFlag && !spliceImmediateFlag) {
                if (index >= endIndex + 1) return { error: "Insufficient data for splice_time()" };
                spliceTime = this._parseSpliceTime(bytes, index);
                if(spliceTime.error) return spliceTime;
                index += spliceTime.bytesRead; // Use bytesRead from parser
            }

            let breakDuration = null;
            let componentCount = 0;
            let components = [];

            if (!programSpliceFlag) { // Component splice mode
                 if (index >= endIndex + 1) return { error: "Insufficient data for component_count" };
                 componentCount = bytes[index++];
                 for(let i = 0; i < componentCount; i++) {
                    if (index >= endIndex + 1) return { error: `Insufficient data for component ${i+1} tag` };
                    const componentTag = bytes[index++];
                    let componentSpliceTime = null;
                    if (!spliceImmediateFlag) {
                        if (index >= endIndex + 1) return { error: `Insufficient data for component ${i+1} splice_time()` };
                        componentSpliceTime = this._parseSpliceTime(bytes, index);
                        if(componentSpliceTime.error) return componentSpliceTime;
                        index += componentSpliceTime.bytesRead;
                    }
                    components.push({ tag: componentTag, spliceTime: componentSpliceTime });
                 }
            }

            if (durationFlag) {
                if (index + 5 > endIndex + 1) return { error: "Insufficient data for break_duration()" };
                breakDuration = this._parseBreakDuration(bytes, index);
                index += 5;
            }

             if (index + 4 > endIndex + 1) return { error: "Insufficient data for unique_program_id, avail_num, avails_expected" };

            const uniqueProgramId = (bytes[index++] << 8) | bytes[index++];
            const availNum = bytes[index++];
            const availsExpected = bytes[index++];

            // Check if we consumed the expected number of bytes
            if (index !== endIndex + 1) {
                console.warn(`[scte_manager] SpliceInsert parser finished at index ${index}, expected ${endIndex + 1}. Extra or missing bytes?`);
            }


            return {
                spliceEventId,
                spliceEventCancelIndicator,
                outOfNetworkIndicator,
                programSpliceFlag,
                durationFlag,
                spliceImmediateFlag,
                spliceTime, // Only present if programSpliceFlag=1 and spliceImmediateFlag=0
                componentCount, // Only present if programSpliceFlag=0
                components, // Only present if programSpliceFlag=0
                breakDuration, // Only present if durationFlag=1
                uniqueProgramId,
                availNum,
                availsExpected
            };
        },

        // Parse a time signal command (0x07)
        _parseTimeSignal: function (bytes, startIndex, endIndex) {
            let index = startIndex;
            const spliceTime = this._parseSpliceTime(bytes, index);
            if (spliceTime.error) return spliceTime;
            index += spliceTime.bytesRead;

            // Check if we consumed the expected number of bytes
            if (index !== endIndex + 1) {
                 console.warn(`[scte_manager] TimeSignal parser finished at index ${index}, expected ${endIndex + 1}. Extra or missing bytes?`);
            }

            return { spliceTime };
        },

        // Parse splice time structure
        _parseSpliceTime: function (bytes, index) {
             const initialIndex = index;
             if (index + 1 > bytes.length) return { error: "Insufficient data for time_specified_flag", bytesRead: 0 };
            const timeSpecifiedFlag = (bytes[index] & 0x80) !== 0;
            // 6 reserved bits
            index++; // Move past flag byte

            if (!timeSpecifiedFlag) {
                // Check for 7 reserved bits if time_specified_flag is 0
                if ((bytes[initialIndex] & 0x7E) !== 0x7E) {
                     console.warn("[scte_manager] Reserved bits not set in splice_time() when time_specified_flag is 0");
                }
                return { specified: false, ptsTime: null, bytesRead: 1 }; // Only read 1 byte
            }

            if (index + 4 > bytes.length) return { error: "Insufficient data for PTS time in splice_time()", bytesRead: index - initialIndex };
            // Check reserved bit
             if ((bytes[initialIndex] & 0x40) !== 0x40) { // bit after time_specified_flag should be 1
                  console.warn("[scte_manager] Reserved bit not set in splice_time() when time_specified_flag is 1");
             }

            const ptsTime = this._readPTS(bytes, index - 1); // Pass the index of the flag byte
            index += 4; // Move past the 4 bytes of PTS time (already advanced 1 for flag)

            return { specified: true, ptsTime, bytesRead: index - initialIndex }; // Read 1 (flag) + 4 (pts) = 5 bytes
        },

        // Parse break duration structure
        _parseBreakDuration: function (bytes, index) {
             if (index + 5 > bytes.length) return { error: "Insufficient data for break_duration()" };
            const autoReturn = (bytes[index] & 0x80) !== 0;
            // 6 reserved bits check
             if ((bytes[index] & 0x7E) !== 0x7E) {
                 console.warn("[scte_manager] Reserved bits not set in break_duration()");
             }

            // Duration is 33 bits
            const duration = ((bytes[index] & 0x01) << 32) | // LSB of first byte is MSB of duration
                             (bytes[index + 1] << 24) |
                             (bytes[index + 2] << 16) |
                             (bytes[index + 3] << 8) |
                              bytes[index + 4];

            return { autoReturn, duration };
        },

        // Parse segmentation descriptor (0x02)
        _parseSegmentationDescriptor: function (bytes, startIndex, endIndex) {
             let index = startIndex;
             const minLength = 4 + 4 + 1 + 1 + 1 + 1 + 1; // id(4) + eventid(4) + cancel(1) + reserved(1) + flags(1) + upid_type(1) + upid_len(1)
             if (endIndex < startIndex + minLength - 1) return { error: "Insufficient data for segmentation_descriptor basic fields" };

             // segmentation_event_id (32 bits)
             const eventId = (bytes[index++] << 24) | (bytes[index++] << 16) | (bytes[index++] << 8) | bytes[index++];

             // segmentation_event_cancel_indicator (1 bit) + reserved (7 bits)
             const cancelIndicator = (bytes[index] & 0x80) !== 0;
             if ((bytes[index] & 0x7F) !== 0x7F) console.warn("[scte_manager] Reserved bits not set after cancel_indicator");
             index++;

             if (cancelIndicator) {
                 // Rest of fields are not present if cancelled
                  if (index !== endIndex + 1) console.warn("[scte_manager] Extra data found after segmentation_event_cancel_indicator");
                 return {
                    identifier: "CUEI", // Should technically parse the 4-byte identifier before event_id, but often assumed CUEI
                    eventId,
                    cancelIndicator
                 };
             }

             // component_count (optional, based on program_segmentation_flag)
             // duration, upid, type, num, expected (dependent on flags)

             // program_segmentation_flag (1 bit), segmentation_duration_flag (1 bit), delivery_not_restricted_flag (1 bit)
             const flagsByte = bytes[index++];
             const programSegmentationFlag = (flagsByte & 0x80) !== 0;
             const segmentationDurationFlag = (flagsByte & 0x40) !== 0;
             const deliveryNotRestrictedFlag = (flagsByte & 0x20) !== 0;

             let webDeliveryAllowedFlag = false;
             let noRegionalBlackoutFlag = false;
             let archiveAllowedFlag = false;
             let deviceRestrictions = 0; // 'None'

             if (!deliveryNotRestrictedFlag) {
                 webDeliveryAllowedFlag = (flagsByte & 0x10) !== 0;
                 noRegionalBlackoutFlag = (flagsByte & 0x08) !== 0;
                 archiveAllowedFlag = (flagsByte & 0x04) !== 0;
                 deviceRestrictions = flagsByte & 0x03; // 00=None, 01=Restrict Group 0, 10=Restrict Group 1, 11=Restrict Group 2
             }
             // else: 5 reserved bits follow delivery_not_restricted_flag=1

             let componentCount = 0;
             let components = [];
             if (!programSegmentationFlag) {
                 if (index >= endIndex + 1) return { error: "Insufficient data for component_count" };
                 componentCount = bytes[index++];
                 const componentMinBytes = 1 + 6; // tag(1) + reserved(7bits)+pts_offset(33bits) = approx 6 bytes
                 if (index + componentCount * componentMinBytes > endIndex + 1) {
                      console.warn("[scte_manager] Potential insufficient data for segmentation descriptor components");
                 }
                 for (let i=0; i<componentCount; i++) {
                     if (index + 7 > endIndex + 1) return { error: `Insufficient data for component ${i+1}`};
                     const tag = bytes[index++];
                     // 7 reserved bits
                      if ((bytes[index] & 0xFE) !== 0xFE) console.warn(`[scte_manager] Reserved bits not set for component ${i+1}`);
                     const ptsOffset = this._readPTS(bytes, index); // Pass index of byte containing reserved bits + MSB of PTS
                     index += 6; // Advance past the 6 bytes (reserved + PTS)
                     components.push({ tag, ptsOffset });
                 }
             }

             let segmentationDuration = null;
             if (segmentationDurationFlag) {
                 if (index + 5 > endIndex + 1) return { error: "Insufficient data for segmentation_duration" };
                 // Duration is 40 bits
                 segmentationDuration = ((bytes[index] & 0xFF) * Math.pow(2, 32)) + // Use full byte for first part
                                        (bytes[index + 1] << 24) |
                                        (bytes[index + 2] << 16) |
                                        (bytes[index + 3] << 8) |
                                         bytes[index + 4];
                 index += 5;
             }

              if (index + 3 > endIndex + 1) return { error: "Insufficient data for segmentation_upid_type, _length, segmentation_type_id" };

             const upidType = bytes[index++];
             const upidLength = bytes[index++];

             let upid = null;
             if (upidLength > 0) {
                  if (index + upidLength > endIndex + 1) return { error: "Insufficient data for segmentation_upid" };
                 // Read UPID based on type and length
                 // For simplicity here, just store raw bytes. Specific decoders could be added.
                 upid = Array.from(bytes.slice(index, index + upidLength));
                 index += upidLength;
             }


             const typeId = bytes[index++];
             const segmentNum = bytes[index++];
             const segmentsExpected = bytes[index++];

             // Sub-segment fields (optional)
             let subSegmentNum = null;
             let subSegmentsExpected = null;
             if (typeId >= 0x34 && typeId <= 0x3B && typeId % 2 === 0) { // Placement Opp Starts
                 if (index + 2 <= endIndex + 1) { // Check if there's enough data
                     subSegmentNum = bytes[index++];
                     subSegmentsExpected = bytes[index++];
                 } else {
                      console.warn("[scte_manager] Missing sub-segment fields for placement opportunity start");
                 }
             }

            // Check if we consumed the expected number of bytes
            if (index !== endIndex + 1) {
                console.warn(`[scte_manager] SegmentationDescriptor parser finished at index ${index}, expected ${endIndex + 1}. Extra or missing bytes?`);
            }

             return {
                 // Assuming identifier is CUEI based on common usage with segmentation descriptors
                 identifier: "CUEI",
                 eventId,
                 cancelIndicator,
                 programSegmentationFlag,
                 segmentationDurationFlag,
                 deliveryNotRestrictedFlag,
                 webDeliveryAllowedFlag, // Only valid if deliveryNotRestrictedFlag=0
                 noRegionalBlackoutFlag, // Only valid if deliveryNotRestrictedFlag=0
                 archiveAllowedFlag,     // Only valid if deliveryNotRestrictedFlag=0
                 deviceRestrictions,     // Only valid if deliveryNotRestrictedFlag=0
                 componentCount,         // Only valid if programSegmentationFlag=0
                 components,             // Only valid if programSegmentationFlag=0
                 segmentationDuration,   // Only valid if segmentationDurationFlag=1
                 upidType: `0x${upidType.toString(16).toUpperCase()}`,
                 upidLength,
                 upid,                   // Raw bytes, interpretation depends on upidType
                 typeId: `0x${typeId.toString(16).toUpperCase()}`,
                 typeIdName: SEGMENTATION_TYPE_IDS[typeId] || 'Unknown',
                 segmentNum,
                 segmentsExpected,
                 subSegmentNum,        // Optional, for placement opps
                 subSegmentsExpected,  // Optional, for placement opps
                 isAdStart: this._isAdStartType(typeId),
                 isAdEnd: this._isAdEndType(typeId)
             };
        },

        // Check if segmentation type ID is in the AD_START_TYPE_IDS set
        _isAdStartType: function (typeId) {
             return AD_START_TYPE_IDS.has(typeId);
        },

        // Check if segmentation type ID is in the AD_END_TYPE_IDS set
        _isAdEndType: function (typeId) {
             return AD_END_TYPE_IDS.has(typeId);
        },

        // Helper to read 33-bit PTS values from 5 bytes starting at byte containing flag + first bit
        _readPTS: function (bytes, index) {
            // PTS is 33 bits, stored across 5 bytes starting from the byte holding the flag/reserved bit + MSB
            // index points to the byte holding the flag and the first bit (bit 32)
            if (index + 5 > bytes.length) {
                // Not enough bytes
                console.error("[scte_manager] Insufficient bytes to read PTS value at index", index);
                return 0; // Or throw error?
            }
            const byte1 = bytes[index];     // Contains bit 32 (as LSB of the upper nibble after flag/reserved)
            const byte2 = bytes[index + 1]; // Contains bits 31-24
            const byte3 = bytes[index + 2]; // Contains bits 23-16
            const byte4 = bytes[index + 3]; // Contains bits 15-8
            const byte5 = bytes[index + 4]; // Contains bits 7-0 (bit 0 is LSB)

            // Extract bits according to SCTE-35 / MPEG-2 spec for PTS (ignoring potential marker bits for simplicity here)
            // bit 32 is in byte1 (position depends on flag) - assuming flag is MSB, reserved is next
            // For splice_time, flag byte has time_specified_flag(1), reserved(1), pts[32](1), pts[31](1), pts[30](1) ...
            // For break_duration, flag byte has auto_return(1), reserved(6), duration[32](1)
            // For seg desc pts_offset, flag byte has reserved(7), pts[32](1)

            // Simpler universal PTS read assuming standard MPEG-2 encoding within the 33 bits:
            // Need to handle the first byte carefully. Let's assume the bit layout from splice_time:
            // first_byte = flag(1) reserved(1) pts[32](1) pts[31](1) pts[30](1) ... -> use `(byte1 & 0x0E) >> 1` for bits 32,31,30 ? No, PTS spec is different.
            // MPEG-2 PTS: '001x'(4) pts[32-30](3) '1'(1) pts[29-15](15) '1'(1) pts[14-0](15) '1'(1)
            // SCTE-35 just stores the 33-bit value directly in 5 bytes, with the MSB (bit 32) being the LSB of the *upper nibble* of the first byte (after flags/reserved).

            // Let's assume index points to the byte containing the *first* bit of the 33-bit field.
            // This interpretation seems most consistent across structures.
            // Example: splice_time: index points to byte after time_specified_flag byte. WRONG. spec says time_specified_flag bit + 33 bits.
            // Let's re-read SCTE 35 spec carefully:
            // pts_time() - 33 bits. Starts *after* the reserved bit following time_specified_flag.
            // If index points to the time_specified_flag byte:
            const pts_32_30 = (byte1 & 0x0E) >> 1; // Bits 32, 31, 30
            const pts_29_22 = byte2;              // Bits 29-22
            const pts_21_15 = (byte3 & 0xFE) >> 1; // Bits 21-15
            const pts_14_7 = byte4;               // Bits 14-7
            const pts_6_0 = (byte5 & 0xFE) >> 1;  // Bits 6-0

            // Combine them:
            // Need multiplication by powers of 2
            // Using BigInt for safety with potentially large 33-bit numbers
            const pts = (BigInt(pts_32_30) << 30n) |
                        (BigInt(pts_29_22) << 22n) |
                        (BigInt(pts_21_15) << 15n) |
                        (BigInt(pts_14_7) << 7n) |
                         BigInt(pts_6_0);


            // Check marker bits (should be '1') - these are in byte1, byte3, byte5 LSBs
            // if (!((byte1 & 0x01) && (byte3 & 0x01) && (byte5 & 0x01))) {
            //    console.warn("[scte_manager] PTS marker bits are not all '1'");
            // }

            // Return as Number if safe, otherwise keep as BigInt? PTS values usually fit in JS Number.
            return Number(pts);
        },


        // Extract SCTE-35 data from a single HLS manifest line.
        extractFromHLSTag: function (line) {
            const trimmedLine = line.trim();
            if (trimmedLine.length === 0) return null;

            try {
                let match;

                // 1. Check #EXT-X-DATERANGE with Hex SCTE35 attributes
                match = trimmedLine.match(HLS_TAG_REGEX.DATERANGE_SCTE35_HEX);
                if (match && match[1]) return this.parseFromHex(match[1]);
                match = trimmedLine.match(HLS_TAG_REGEX.DATERANGE_SCTE35_ATTR_HEX);
                 if (match && match[1]) return this.parseFromHex(match[1]);

                // 2. Check #EXT-X-CUE / #EXT-X-CUE-OUT with Base64 payload
                // Prioritize CUE-OUT as it's more specific
                if (trimmedLine.startsWith('#EXT-X-CUE-OUT:')) {
                     match = trimmedLine.match(HLS_TAG_REGEX.CUE_OUT_B64);
                     if (match && match[1]) return this.parseFromB64(match[1]);
                } else if (trimmedLine.startsWith('#EXT-X-CUE:')) {
                     match = trimmedLine.match(HLS_TAG_REGEX.CUE_GENERIC_B64);
                     if (match && match[1]) return this.parseFromB64(match[1]);
                }

                // 3. Check for generic SCTE35= attribute (Base64 or Hex) - could be on various tags
                match = trimmedLine.match(HLS_TAG_REGEX.ATTR_SCTE35_B64);
                if (match && match[1]) return this.parseFromB64(match[1]);
                match = trimmedLine.match(HLS_TAG_REGEX.ATTR_SCTE35_HEX);
                if (match && match[1]) return this.parseFromHex(match[1]);

                // 4. Check other common Base64 attributes (SIGNAL=, MARKER=)
                match = trimmedLine.match(HLS_TAG_REGEX.ATTR_SIGNAL_B64);
                 if (match && match[1]) return this.parseFromB64(match[1]);
                match = trimmedLine.match(HLS_TAG_REGEX.ATTR_MARKER_B64);
                 if (match && match[1]) return this.parseFromB64(match[1]);

                // 5. Check for generic #EXT-SCTE35 / #EXT-X-SCTE35 tags
                 match = trimmedLine.match(HLS_TAG_REGEX.EXT_SCTE35_TAG);
                 if (match && match[1]) {
                     const data = match[1];
                     // Attempt to detect if it's Base64 or Hex
                     if (/^[A-Za-z0-9+\/=]+$/.test(data) && data.length % 4 === 0) { // Basic Base64 check
                         return this.parseFromB64(data);
                     } else if (/^(0x)?[0-9A-F]+$/i.test(data)) { // Basic Hex check
                         return this.parseFromHex(data);
                     } else {
                         console.warn("[scte_manager] Found generic EXT-SCTE35 tag but couldn't determine data format:", data);
                     }
                 }

                return null; // No SCTE-35 data found in this line
            } catch (error) {
                console.error("Error extracting SCTE-35 from HLS tag:", error, "Line:", line);
                return null; // Return null on error during extraction/parsing
            }
        },

        // Get a human-readable description of a parsed SCTE-35 signal
        getHumanReadableDescription: function (parsedScte35) {
            if (!parsedScte35) return "Invalid SCTE-35 signal data";
            if (parsedScte35.error) {
                return `Error parsing SCTE-35: ${parsedScte35.error}`;
            }

            let description = `SCTE-35 ${parsedScte35.spliceCommandTypeName || 'No Command'} (Table: ${parsedScte35.tableId})`;

            const commandType = parsedScte35.spliceCommandType;
            const commandInfo = parsedScte35.spliceCommandInfo;
            const descriptors = parsedScte35.descriptors || [];

            // Handle Splice Insert (0x05)
            if (commandType === '0x05' && commandInfo) {
                if (commandInfo.spliceEventCancelIndicator) {
                    return `${description}: Cancel Splice Event ID ${commandInfo.spliceEventId}`;
                }
                description += commandInfo.outOfNetworkIndicator ? " (OUT)" : " (IN)";
                description += ` Event ID: ${commandInfo.spliceEventId}`;
                if (commandInfo.spliceImmediateFlag) {
                    description += " - Immediate";
                } else if (commandInfo.spliceTime && commandInfo.spliceTime.specified) {
                    description += ` - @ PTS ${formatScteTime(commandInfo.spliceTime.ptsTime)}`;
                }
                if (commandInfo.breakDuration) {
                    const durationSecs = commandInfo.breakDuration.duration / 90000;
                    description += ` - Duration: ${durationSecs.toFixed(3)}s`;
                    if(commandInfo.breakDuration.autoReturn) description += " (Auto Return)";
                }
                if (!commandInfo.programSpliceFlag) {
                    description += ` - Components: ${commandInfo.componentCount}`;
                }
            }
            // Handle Time Signal (0x07) - Often relies on descriptors
            else if (commandType === '0x07' && commandInfo) {
                 if (commandInfo.spliceTime && commandInfo.spliceTime.specified) {
                    description += ` - @ PTS ${formatScteTime(commandInfo.spliceTime.ptsTime)}`;
                 } else {
                    description += ` - No Time Specified`;
                 }
            }

            // Add info from Segmentation Descriptors (can be present with various commands)
            const segmentationDescriptors = descriptors.filter(d => d.tag === 0x02 && d.info && !d.info.error);
            if (segmentationDescriptors.length > 0) {
                description += ' | SegDesc:';
                segmentationDescriptors.forEach((desc, i) => {
                    const segInfo = desc.info;
                    if (segInfo.cancelIndicator) {
                        description += ` [Cancel Event ${segInfo.eventId}]`;
                        return; // Skip details for cancel descriptor
                    }

                    let segDescText = ` [${i+1}: ${segInfo.typeIdName || `Type ${segInfo.typeId}`}`;
                    if (segInfo.isAdStart) segDescText += " (Ad Start)";
                    else if (segInfo.isAdEnd) segDescText += " (Ad End)";
                    segDescText += ` Event ${segInfo.eventId}`;

                    if (segInfo.segmentationDuration !== null) {
                        const durationSecs = segInfo.segmentationDuration / 90000;
                        segDescText += ` Dur: ${durationSecs.toFixed(3)}s`;
                    }
                     segDescText += ` (${segInfo.segmentNum}/${segInfo.segmentsExpected})`;
                    if (segInfo.upid) {
                        segDescText += ` UPID(${segInfo.upidType}): ${formatUpid(segInfo.upid, segInfo.upidType)}`;
                    }
                     segDescText += ']';
                     description += segDescText;
                });
            } else if (descriptors.length > 0) {
                // Indicate presence of other descriptors
                 description += ` | Descriptors: ${descriptors.map(d => d.tagName || `Tag 0x${d.tag.toString(16)}`).join(', ')}`;
            }

            return description;
        }
    };

    // --- SCTE Manager Logic ---

    // State
    let hlsInstance = null;
    const scteSignals = []; // Array to store detected signals { id, timestamp, source, parsedData, description, rawLine/Payload }
    let signalCounter = 0;
    let discontinuityCount = 0;
    let lastDiscontinuityTime = 0;

    // DOM Elements (cached on init)
    let scteDisplayEl = null;
    let scteDetailContainerEl = null;
    let scteTimelineEl = null;
    let adRatioGraphEl = null; // Optional Ad Ratio graph elements
    let adRatioEl = null;
    let adCountEl = null;

    // --- Initialization ---
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        console.log('[scte_manager] DOM ready.');
        scteDisplayEl = document.getElementById('scteDisplay');
        scteDetailContainerEl = document.getElementById('scteDetailContainer');
        scteTimelineEl = document.getElementById('scteTimeline');
        adRatioGraphEl = document.getElementById('adRatioGraph');
        adRatioEl = document.getElementById('adRatio');
        adCountEl = document.getElementById('adCount');

        if (!scteDisplayEl || !scteDetailContainerEl || !scteTimelineEl) {
            console.warn('[scte_manager] Required SCTE UI elements not found. SCTE display disabled.');
            // Allow manager to run for parsing, just disable UI updates
        }

        if (scteDetailContainerEl) scteDetailContainerEl.style.display = 'block'; // Start visible

        resetState(); // Initial reset

        // --- Event Listeners ---
        document.addEventListener('hlsPlaylistParsed', handleHlsPlaylistParsed);
        document.addEventListener('hlsLoaded', handleHlsLoaded);
        document.addEventListener('newStreamLoading', resetState); // Reset on new stream
        document.addEventListener('hlsDiscontinuityDetected', handleDiscontinuity);
        document.addEventListener('hlsContentBoundaryDetected', handleContentBoundary); // For more complex boundary detection

        console.log('[scte_manager] Initialized and listening for HLS events.');
    }

    // --- State Management ---
    function resetState() {
        console.log('[scte_manager] Resetting SCTE state.');
        scteSignals.length = 0; // Clear the array
        signalCounter = 0;
        discontinuityCount = 0;
        lastDiscontinuityTime = 0;

        // Reset UI elements if they exist
        if (scteDisplayEl) scteDisplayEl.innerHTML = "Awaiting stream data...";
        if (scteDetailContainerEl) {
            scteDetailContainerEl.innerHTML = '<div class="scte-detail-empty">No SCTE-35 signals decoded yet</div>';
            // scteDetailContainerEl.style.display = 'block'; // Keep it visible
        }
        if (scteTimelineEl) scteTimelineEl.innerHTML = '';

        updateAdStatsDisplay(); // Reset ad stats display

        // Optional: Reset Ad Ratio Graph canvas
        if (adRatioGraphEl && adRatioGraphEl.getContext) {
            const ctx = adRatioGraphEl.getContext('2d');
            ctx.clearRect(0, 0, adRatioGraphEl.width, adRatioGraphEl.height);
            ctx.fillStyle = '#999'; ctx.font = '10px Arial'; ctx.textAlign = 'center';
            ctx.fillText('No ad data', adRatioGraphEl.width / 2, adRatioGraphEl.height / 2);
        }
    }

    // --- Event Handlers ---

    function handleHlsLoaded(event) {
        if (event.detail.hls && !hlsInstance) {
            console.log('[scte_manager] HLS instance available.');
            hlsInstance = event.detail.hls;
            // TODO: If needed, attach listeners for FRAG_PARSING_METADATA (ID3 tags)
            // hlsInstance.on(Hls.Events.FRAG_PARSING_METADATA, handleFragMetadata);
        }
    }

    function handleHlsPlaylistParsed(event) {
        const { type, content, url } = event.detail;
        if (!content || typeof content !== 'string') return;

        // console.log(`[scte_manager] Processing playlist (${type}) for SCTE tags: ${url}`);
        const lines = content.split('\n');
        let scteFoundInPlaylist = false;
        lines.forEach(line => {
            const parsedData = SCTE35Parser.extractFromHLSTag(line); // Use the refactored single-line extractor
            if (parsedData) {
                 scteFoundInPlaylist = true;
                 console.log('[scte_manager] Found SCTE in manifest line:', line.trim(), 'Parsed:', parsedData);
                addScteSignal({
                    source: `manifest (${type})`,
                    rawLine: line.trim(),
                    parsedData: parsedData,
                    timestamp: Date.now() // Manifest timestamp is less precise, use processing time
                });
            }
        });
         // if (scteFoundInPlaylist) console.log(`[scte_manager] Finished processing playlist ${url}`);
    }

     // Handles simple discontinuity tags for basic boundary detection
    function handleDiscontinuity(event) {
        const segment = event.detail.segment;
        if (!segment) return;

        const now = Date.now();
        // Avoid flooding if discontinuities happen very rapidly
        if (now - lastDiscontinuityTime < 500) {
             // console.log('[scte_manager] Skipping rapid discontinuity detection.');
            return;
        }

        discontinuityCount++;
        lastDiscontinuityTime = now;
        const url = segment.url || '';
        // Use regex for more robust ad URL detection
        const isLikelyAd = AD_URL_REGEX.test(url);

        let contentType = isLikelyAd ? 'Ad Boundary' : 'Content Boundary';
        let heuristicType = isLikelyAd ? 'ad-boundary' : 'discontinuity';
        const description = `${contentType} (Heuristic: Discontinuity #${discontinuityCount})`;

        console.log(`[scte_manager] Handling ${contentType.toLowerCase()} (Discontinuity): Seq ${segment.sequence}, Likely Ad: ${isLikelyAd}, URL: ${url}`);

        addScteSignal({
            source: 'discontinuity-heuristic',
            timestamp: now,
            parsedData: {
                // Mimic SCTE structure for consistency
                spliceCommandTypeName: 'Heuristic Signal',
                isHeuristic: true,
                heuristicType: heuristicType,
                discontinuityCount: discontinuityCount,
                isLikelyAd: isLikelyAd,
                segmentSequence: segment.sequence,
                segmentUrl: url // Store URL for context
            },
            description: description,
            rawLine: `#EXT-X-DISCONTINUITY (before seq ${segment.sequence})`
        });
    }

     // Handles more complex, pattern-based boundary detections (if implemented)
    function handleContentBoundary(event) {
        const { patternData, timestamp } = event.detail;
        console.log('[scte_manager] Handling Pattern-Detected Content Boundary:', patternData);

        addScteSignal({
            source: 'pattern-detection',
            timestamp: timestamp || Date.now(),
            parsedData: {
                spliceCommandTypeName: 'Pattern Signal',
                isHeuristic: true,
                heuristicType: 'major-boundary', // Example type
                patternDetails: patternData // Include detected pattern info
            },
            description: `Major Content Boundary (Pattern Match)`,
            rawLine: `Pattern: ${patternData.matched || 'Custom Pattern'}`
        });
    }

    // Add a new signal to the list and update UI
    function addScteSignal(signalData) {
        signalCounter++;
        const newSignal = {
            id: `scte_${signalCounter}`,
            timestamp: signalData.timestamp || Date.now(),
            source: signalData.source,
            rawLine: signalData.rawLine,
            payload: signalData.payload, // Raw bytes if from ID3
            parsedData: signalData.parsedData,
            // Generate description only if not provided or if data is valid
            description: signalData.description || (signalData.parsedData && !signalData.parsedData.error
                            ? SCTE35Parser.getHumanReadableDescription(signalData.parsedData)
                            : "Signal could not be parsed"),
            isAdSignal: isAdSignal(signalData.parsedData) // Pre-calculate if it's ad-related
        };

        // Basic duplicate check (can be enhanced)
        const isDuplicate = scteSignals.some(existing =>
             // Avoid identical discontinuity heuristics too close together
            (existing.source === 'discontinuity-heuristic' && newSignal.source === 'discontinuity-heuristic' && Math.abs(existing.timestamp - newSignal.timestamp) < 1000) ||
            // Avoid identical *parsed* SCTE signals (non-heuristic) very close together
            (existing.parsedData && newSignal.parsedData && !existing.parsedData.isHeuristic && !newSignal.parsedData.isHeuristic &&
             !existing.parsedData.error && !newSignal.parsedData.error &&
             JSON.stringify(existing.parsedData) === JSON.stringify(newSignal.parsedData) &&
             Math.abs(existing.timestamp - newSignal.timestamp) < 500)
        );

        if (!isDuplicate) {
            scteSignals.push(newSignal);
            console.log('[scte_manager] Added SCTE Signal:', newSignal.id, newSignal.description);

            // Update UI components if they exist
            if (scteDetailContainerEl) updateScteDetailDisplay();
            if (scteTimelineEl) updateScteTimeline(); // Update timeline based on PTS if available
            if (scteDisplayEl) updateScteSummaryDisplay(); // Update summary (e.g., ad count)
            if (adCountEl || adRatioEl) updateAdStatsDisplay(); // Update dedicated ad stats

        } else {
            console.log('[scte_manager] Skipping likely duplicate SCTE signal:', newSignal.description);
        }
    }

    // Helper function to determine if a signal is likely ad-related
    function isAdSignal(parsedData) {
        if (!parsedData || parsedData.error) return false;

        // 1. Heuristic signals identified as ad-related
        if (parsedData.isHeuristic && (parsedData.heuristicType === 'ad-boundary' || parsedData.heuristicType === 'ad-start')) {
            return true;
        }

        // 2. Splice Insert OUT command
        if (parsedData.spliceCommandType === '0x05' && parsedData.spliceCommandInfo?.outOfNetworkIndicator) {
            return true;
        }

        // 3. Segmentation Descriptors indicating ads (Start or End)
        if (parsedData.descriptors?.some(d => d.tag === 0x02 && d.info && (d.info.isAdStart || d.info.isAdEnd))) {
             return true;
        }

        return false;
    }


    // --- UI Update Functions ---

    function updateScteSummaryDisplay() {
        if (!scteDisplayEl) return;

        const adSignals = scteSignals.filter(s => s.isAdSignal);
        const totalSignals = scteSignals.length;

        if (totalSignals === 0) {
            scteDisplayEl.innerHTML = "No SCTE signals detected";
            return;
        }

        let summaryHtml = `<div class="scte-info">
            <span>Total Signals:</span>
            <span class="scte-value">${totalSignals}</span>
            <span> | Ad Related:</span>
            <span class="scte-value">${adSignals.length}</span>
        </div>`;

        const lastSignal = scteSignals[scteSignals.length - 1];
        if (lastSignal) {
            let lastSignalText = lastSignal.description || "Processing...";
             // Truncate long descriptions
             if (lastSignalText.length > 100) {
                 lastSignalText = lastSignalText.substring(0, 97) + "...";
             }
            summaryHtml += `<div class="scte-info">
                <span>Last:</span>
                <span class="scte-value" title="${lastSignal.description}">${lastSignalText}</span>
            </div>`;
        }
        scteDisplayEl.innerHTML = summaryHtml;
    }

    function updateScteDetailDisplay() {
        if (!scteDetailContainerEl) return;

        if (scteSignals.length === 0) {
            scteDetailContainerEl.innerHTML = '<div class="scte-detail-empty">No SCTE-35 signals decoded yet</div>';
            return;
        }

        const recentSignals = scteSignals.slice().reverse(); // Show most recent first
        scteDetailContainerEl.innerHTML = ''; // Clear previous details

        recentSignals.forEach(signal => {
            const parsed = signal.parsedData;
            const signalEl = document.createElement('div');
            signalEl.className = 'scte-signal';

            const headerEl = document.createElement('div');
            headerEl.className = 'scte-signal-header';

            const sourceEl = document.createElement('div');
            sourceEl.className = 'scte-signal-source';
            let sourceText = `Source: ${signal.source} @ ${new Date(signal.timestamp).toLocaleTimeString()}`;
            if (signal.rawLine) {
                 sourceText += ` | Raw: ${signal.rawLine.length > 80 ? signal.rawLine.substring(0, 77) + '...' : signal.rawLine}`;
            }
            sourceEl.textContent = sourceText;
            sourceEl.title = signal.rawLine || 'No raw line data'; // Show full line on hover

            // --- Handle Heuristic Signals (e.g., Discontinuity) ---
            if (parsed && parsed.isHeuristic) {
                let headerText = parsed.description || "Heuristic Signal";

                // Add appropriate CSS class based on heuristic type for styling              
                if (parsed.heuristicType === 'ad-boundary') {
                    signalEl.classList.add('ad-boundary');  
                } else {
                    signalEl.classList.add('content-boundary'); // Default for other heuristics
                }

                headerEl.textContent = headerText;

                const contextEl = document.createElement('div');
                contextEl.className = 'scte-signal-details';
                let contextText = `Type: ${parsed.heuristicType || 'unknown'}`;
                if (parsed.discontinuityCount) contextText += `, Discontinuity #: ${parsed.discontinuityCount}`;
                if (parsed.segmentSequence) contextText += `, Before Seq: ${parsed.segmentSequence}`;
                 if (parsed.patternDetails) contextText += `, Pattern: ${JSON.stringify(parsed.patternDetails)}`;
                contextEl.textContent = contextText;
                if (parsed.segmentUrl) {
                    const urlEl = document.createElement('div');
                    urlEl.className = 'scte-signal-details heuristic-url';
                    urlEl.textContent = `URL: ${parsed.segmentUrl.length > 100 ? parsed.segmentUrl.substring(0,97) + '...' : parsed.segmentUrl}`;
                    urlEl.title = parsed.segmentUrl;
                     contextEl.appendChild(urlEl);
                }


                signalEl.appendChild(headerEl);
                signalEl.appendChild(contextEl);
                signalEl.appendChild(sourceEl);

            // --- Handle Parsed SCTE Signals ---
            } else if (parsed && !parsed.error) {
                let header = signal.description || "Parsed SCTE Signal"; // Use pre-generated description
                headerEl.textContent = header;

                 // Add CSS classes for styling based on type
                 let typeClass = '';
                 if(parsed.spliceCommandInfo?.outOfNetworkIndicator) typeClass = 'ad-start';
                 const primarySegDesc = parsed.descriptors?.find(d => d.tag === 0x02)?.info;
                 if (primarySegDesc && !primarySegDesc.cancelIndicator) {
                     if (primarySegDesc.isAdStart) typeClass = 'ad-start';
                     else if (primarySegDesc.isAdEnd) typeClass = 'ad-end';
                 }
                 if (typeClass) signalEl.classList.add(typeClass);


                signalEl.appendChild(headerEl);

                // Optional: Add raw parsed data view (collapsible?)
                const detailsEl = document.createElement('details');
                detailsEl.className = 'scte-signal-raw-details';
                const summaryEl = document.createElement('summary');
                summaryEl.textContent = 'Parsed Data';
                const preEl = document.createElement('pre');
                preEl.textContent = JSON.stringify(parsed, null, 2);
                detailsEl.appendChild(summaryEl);
                detailsEl.appendChild(preEl);
                signalEl.appendChild(detailsEl);

                signalEl.appendChild(sourceEl);

            // --- Handle Signals with Parsing Errors ---
            } else {
                signalEl.classList.add('signal-error');
                headerEl.textContent = `Error Processing Signal`;
                headerEl.style.color = 'red';

                const errorDetailsEl = document.createElement('div');
                errorDetailsEl.className = 'scte-signal-details';
                errorDetailsEl.textContent = parsed?.error || signal.description || 'Could not parse data.';
                signalEl.appendChild(headerEl);
                signalEl.appendChild(errorDetailsEl);
                signalEl.appendChild(sourceEl); // Still show source info
            }

            scteDetailContainerEl.appendChild(signalEl);
        });
    }


    function updateScteTimeline() {
        if (!scteTimelineEl || !hlsInstance || !hlsInstance.media || !hlsInstance.currentLevel) return;

        // Use level details if available, otherwise fallback to media duration
        const levelDetails = hlsInstance.levels[hlsInstance.currentLevel]?.details;
        const videoDuration = levelDetails?.totalduration ?? hlsInstance.media.duration;

        if (!videoDuration || !isFinite(videoDuration) || videoDuration <= 0) {
             // console.warn("[scte_manager] Cannot update timeline: Invalid video duration", videoDuration);
            return; // Need a valid duration
        }

        scteTimelineEl.innerHTML = ''; // Clear existing markers

        scteSignals.forEach(signal => {
            const parsed = signal.parsedData;
            if (!parsed || parsed.error || parsed.isHeuristic) return; // Only plot non-heuristic signals with time

            // Try to get PTS time
            let signalPts = null;
            if (parsed.spliceCommandInfo?.spliceTime?.specified) {
                signalPts = parsed.spliceCommandInfo.spliceTime.ptsTime;
            } else if (parsed.spliceCommandInfo?.components?.length > 0 && parsed.spliceCommandInfo.components[0].spliceTime?.specified) {
                // Use first component time if program time is not specified
                 signalPts = parsed.spliceCommandInfo.components[0].spliceTime.ptsTime;
            } else if (parsed.descriptors?.length > 0) {
                 // Check descriptors for time info (less common for timeline plotting)
            }

            if (signalPts !== null) {
                 const signalTimeSeconds = signalPts / 90000; // Convert PTS (90kHz) to seconds

                 // Simple check: Plot only if within current known duration
                 if (signalTimeSeconds >= 0 && signalTimeSeconds <= videoDuration) {
                    const positionPercent = (signalTimeSeconds / videoDuration) * 100;

                    let typeClass = '';
                    if (parsed.spliceCommandInfo?.outOfNetworkIndicator) typeClass = 'ad-start';
                    const primarySegDesc = parsed.descriptors?.find(d => d.tag === 0x02)?.info;
                     if (primarySegDesc && !primarySegDesc.cancelIndicator) {
                         if (primarySegDesc.isAdStart) typeClass = 'ad-start';
                         else if (primarySegDesc.isAdEnd) typeClass = 'ad-end';
                     }

                    const markerEl = document.createElement('div');
                    markerEl.className = `scte-marker-point ${typeClass}`;
                    markerEl.style.left = `${positionPercent.toFixed(2)}%`;
                    markerEl.title = `${signal.description || 'SCTE-35 Signal'} @ ${signalTimeSeconds.toFixed(3)}s`;
                    scteTimelineEl.appendChild(markerEl);
                } else {
                    // console.log(`[scte_manager] Signal PTS (${signalTimeSeconds}s) is outside video duration (${videoDuration}s) - not plotting.`);
                }
            }
        });
    }

    function updateAdStatsDisplay() {
        if (!adCountEl && !adRatioEl) return; // Nothing to update

        // Count ad starts (OUT signals or specific segmentation types)
        const adStarts = scteSignals.filter(s => {
            const parsed = s.parsedData;
            if (!parsed || parsed.error) return false;
            return parsed.isAdSignal && // Use pre-calculated flag
                   ( (parsed.spliceCommandInfo?.outOfNetworkIndicator) || // Splice Insert OUT
                     (parsed.descriptors?.some(d => d.tag === 0x02 && d.info?.isAdStart)) // SegDesc Ad Start
                   );
        }).length;

        if (adCountEl) adCountEl.textContent = `Ads Detected: ${adStarts}`;

        // Basic ratio calculation needs duration tracking (complex)
        if (adRatioEl) adRatioEl.textContent = `Ad Ratio: N/A`; // Placeholder

        // TODO: Add logic for Ad Ratio Graph update if needed
    }

    // --- Utility Functions ---

    // Make toggle function global if needed for HTML onclick
    window.toggleScteDetails = function (event) {
        if (event) event.preventDefault();
        if (scteDetailContainerEl) {
            const isHidden = scteDetailContainerEl.style.display === 'none';
            scteDetailContainerEl.style.display = isHidden ? 'block' : 'none';
            // Update toggle link text if it exists
            // const toggleLink = document.querySelector('.scte-detail-toggle');
            // if(toggleLink) toggleLink.textContent = isHidden ? 'Hide Details' : 'Show Details';
        }
    };

    // Format PTS time (seconds.milliseconds)
    function formatScteTime(pts) {
        if (pts === undefined || pts === null || typeof pts !== 'number' || !isFinite(pts)) return 'N/A';
        const seconds = pts / 90000; // 90kHz clock
        return seconds.toFixed(3);
    }

    // Format UPID (needs type knowledge for proper formatting)
    function formatUpid(upidBytes, upidType) {
        // Basic validation
        if (!upidBytes || !Array.isArray(upidBytes) || upidBytes.length === 0) {
            return 'N/A';
        }

        // Default format: Hexadecimal string
        const hexString = upidBytes.map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
        let formattedUpid = hexString; // Start with hex as default/fallback

        // Determine the numeric value of the type (input might be "0x0C")
        let typeValue = NaN;
        if (typeof upidType === 'string' && upidType.startsWith('0x')) {
             try { typeValue = parseInt(upidType, 16); } catch (e) { /* ignore */ }
        } else if (typeof upidType === 'number') {
            typeValue = upidType;
        }

        if (isNaN(typeValue)) {
            console.warn(`[scte_manager] Invalid or unparsable upidType provided: ${upidType}. Defaulting to hex.`);
            return hexString; // Return default if type is invalid
        }

        // Apply specific formatting based on typeValue
        switch (typeValue) {
            // Types commonly represented as ASCII/UTF-8 strings:
            case 0x03: // Ad-ID™ (Often ASCII, though technically proprietary)
            case 0x05: // ISAN (URN format, e.g., urn:isan:...)
            case 0x06: // V-ISAN (URN format)
            case 0x08: // TI (Turner Identifier - Alphanumeric)
            case 0x09: // MPU() - MID (URN format, e.g., urn:scte:mid:...)
            case 0x0A: // MPU() - MID (URL format, e.g., http://...)
            case 0x0B: // EIDR (URN format, e.g., urn:eidr:...)
            case 0x0C: // ADS Information (Often ASCII/XML, though technically proprietary)
            case 0x0D: // URI (RFC 3986, e.g., http://, urn:, tag:)
            case 0x0E: // ISCI (Alphanumeric code)
                try {
                    // Attempt to decode as a string (assuming UTF-8 compatibility for ASCII)
                    formattedUpid = String.fromCharCode(...upidBytes);
                    // Basic check for printable ASCII range + common UTF-8 chars might be useful,
                    // but can be complex. For simplicity, we just attempt the decode.
                    if (!formattedUpid || formattedUpid.includes('\uFFFD')) {
                        // If decoding results in replacement characters or empty string, fallback might be better
                         console.warn(`[scte_manager] UPID type ${upidType} decoded with potentially invalid characters, consider hex.`);
                        // Keep the decoded string for now, but hex might be more reliable if issues arise.
                        // formattedUpid = hexString; // Optional: Force fallback to hex if decode seems bad
                    }
                } catch (e) {
                    console.warn(`[scte_manager] Failed to decode UPID type ${upidType} as string, falling back to hex:`, e);
                    formattedUpid = hexString; // Fallback to hex on decoding error
                }
                break;

            // Types explicitly defined as Hexadecimal or binary:
            case 0x07: // TID (Tribune Media Systems Identifier - Hexadecimal)
            case 0x10: // UUID / ETSI TS 103 285 (Typically represented as hex)
                // Hex is the standard/expected format
                formattedUpid = hexString;
                break;

            // Deprecated types - Default to hex
            case 0x01: // Deprecated (Use 0x09/0x0A)
            case 0x02: // Deprecated (Use 0x0C)
            case 0x04: // Deprecated

            // Other/Unknown/Binary types - Default to hex
            case 0x00: // Not Used
            case 0x0F: // Private - Cannot assume format
            // Add cases for any other specific types if known (e.g., 0x11, 0x12...)
            default:
                // Default hex format is already set
                // console.log(`[scte_manager] Using default hex format for UPID type ${upidType}`);
                break;
        }

        // Add prefix for clarity based on type where appropriate
        switch (typeValue) {
            case 0x03: return `Ad-ID: ${formattedUpid}`;
            case 0x05: return `ISAN: ${formattedUpid}`; // Often starts 'urn:isan:'
            case 0x06: return `V-ISAN: ${formattedUpid}`; // Often starts 'urn:isan:'
            case 0x07: return `TID: ${hexString}`; // Always show hex for TID
            case 0x08: return `TI: ${formattedUpid}`;
            case 0x09: return `MID (URN): ${formattedUpid}`; // Often starts 'urn:scte:mid:'
            case 0x0A: return `MID (URL): ${formattedUpid}`; // Often starts 'http://'
            case 0x0B: return `EIDR: ${formattedUpid}`; // Often starts 'urn:eidr:'
            case 0x0C: return `ADS Info: ${formattedUpid}`;
            case 0x0D: return `URI: ${formattedUpid}`;
            case 0x0E: return `ISCI: ${formattedUpid}`;
            case 0x10: return `UUID: ${hexString}`; // Always show hex for UUID
            case 0x0F: return `Private: ${hexString}`; // Show hex for private
            default: return `Type ${upidType} (Hex): ${hexString}`; // Fallback for unknown/binary/deprecated
        }
    }

    // Expose parser for external use if necessary
    window.SCTE35Parser = SCTE35Parser;

})(); // IIFE closes