/**
 * Property name compressor that shortens object keys using a predefined mapping
 */
class PropertyCompressor {
    constructor() {
        // Define mapping between full and short property names
        this.propertyMap = {
            // Action properties
            hash: 'h',
            account: 'a',
            delegator: 'd',
            blockHash: 'bh',
            lastSeenBlockHash: 'lbh',
            timestamp: 'ts',
            nonce: 'n',
            signatures: 'sig',
            previousActions: 'pa',
            
            // Instruction properties
            instruction: 'i',
            type: 't',
            toAccount: 'to',
            amount: 'am',
            message: 'm',
            fee: 'f',
            crossNetworkAction: 'cna',
            networkId: 'nid',
            validatorSignatures: 'vs',
            
            // Block properties
            previousBlockHash: 'pbh',
            actions: 'act',
            creator: 'cr',
            crossNetworkActions: 'cact',
            
            // Account properties
            balance: 'bal',
            lastActionHash: 'lah',
            actionCount: 'ac',
            networkValidatorWeights: 'nvw',
            history: 'his',
            startAction: 'sa'
        };
        
        // Create reverse mapping for decompression
        this.reverseMap = {};
        for (const [key, value] of Object.entries(this.propertyMap)) {
            this.reverseMap[value] = key;
        }
        
        // Version of the compressor - increment when making breaking changes
        this.version = 1;
    }

    /**
     * Compress an object by shortening its property names
     * @param {Object} obj - The object to compress
     * @returns {Object} - Compressed object
     */
    compress(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        
        // Handle arrays
        if (Array.isArray(obj)) {
            return obj.map(item => this.compress(item));
        }
        
        const compressed = {};
        
        // Add version marker to root objects
        compressed['_v'] = this.version;
        
        // Process all properties recursively
        for (const [key, value] of Object.entries(obj)) {
            const shortKey = this.propertyMap[key] || key;
            compressed[shortKey] = this.compress(value);
        }
        
        return compressed;
    }

    /**
     * Decompress an object by expanding its property names
     * @param {Object} obj - The compressed object
     * @returns {Object} - Decompressed object
     */
    decompress(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        
        // Handle arrays
        if (Array.isArray(obj)) {
            return obj.map(item => this.decompress(item));
        }
        
        // Handle uncompressed objects (backward compatibility)
        if (!obj['_v'] && Object.keys(this.reverseMap).every(shortKey => !obj.hasOwnProperty(shortKey))) {
            return obj;
        }
        
        const decompressed = {};
        
        // Process all properties recursively
        for (const [shortKey, value] of Object.entries(obj)) {
            // Skip version marker
            if (shortKey === '_v') continue;
            
            const fullKey = this.reverseMap[shortKey] || shortKey;
            decompressed[fullKey] = this.decompress(value);
        }
        
        return decompressed;
    }
    
    /**
     * Add new properties to the mapping
     * @param {Object} newMappings - Object with new property mappings
     */
    extendMapping(newMappings) {
        for (const [key, value] of Object.entries(newMappings)) {
            if (!this.propertyMap[key]) {
                this.propertyMap[key] = value;
                this.reverseMap[value] = key;
            }
        }
    }
}

module.exports = PropertyCompressor; 