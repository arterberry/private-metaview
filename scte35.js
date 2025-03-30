// scte35.js - SCTE-35 Parser library for VIDINFRA MetaView
// A minimized implementation for parsing and interpreting SCTE-35 signals

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
    parseFromB64: function(base64Data) {
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
    parseFromBytes: function(bytes) {
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
    _parseSpliceInsert: function(bytes, startIndex, endIndex) {
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
    _parseTimeSignal: function(bytes, startIndex, endIndex) {
        const spliceTime = this._parseSpliceTime(bytes, startIndex);
        return {
            spliceTime
        };
    },
    
    // Parse splice time
    _parseSpliceTime: function(bytes, index) {
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
    _parseBreakDuration: function(bytes, index) {
        const autoReturn = (bytes[index] & 0x80) !== 0;
        const duration = ((bytes[index] & 0x01) << 32) | (bytes[index + 1] << 24) |
                        (bytes[index + 2] << 16) | (bytes[index + 3] << 8) | bytes[index + 4];
        
        return {
            autoReturn,
            duration
        };
    },
    
    // Parse segmentation descriptor
    _parseSegmentationDescriptor: function(bytes, startIndex, endIndex) {
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
    _isAdStartType: function(typeId) {
        return [0x22, 0x30, 0x32, 0x34, 0x36, 0x38, 0x3A, 0x3C, 0x3E, 0x44, 0x46].includes(typeId);
    },
    
    // Check if segmentation type is an ad end
    _isAdEndType: function(typeId) {
        return [0x23, 0x31, 0x33, 0x35, 0x37, 0x39, 0x3B, 0x3D, 0x3F, 0x45, 0x47].includes(typeId);
    },
    
    // Helper to read PTS values
    _readPTS: function(bytes) {
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
    extractFromHLSTags: function(line) {
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
    getHumanReadableDescription: function(parsedScte35) {
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