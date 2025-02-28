const crypto = require('crypto');
const blake2 = require('blake2');  // Use the optimized version

class Hasher {
    constructor() {
    }

    // Create Blake2bp hash from buffer input
    static hashBuffer(buffer, length = 32, output = 'hex') {
        // Use Blake2bp with specific length
        const hash = blake2.createHash('blake2bp', {
            digestLength: length
        });
        hash.update(buffer);
        return hash.digest(output);
    }

    // Create Blake2bp hash from string input
    static hashText(input, length = 32, output = 'hex') {
        const hash = blake2.createHash('blake2bp', {
            digestLength: length
        });
        hash.update(Buffer.from(input));
        return hash.digest(output);
    }

    // For batch hashing multiple items
    static hashBuffers(buffers, length = 32, output = 'hex') {
        const hash = blake2.createHash('blake2bp', {
            digestLength: length
        });
        for (const buffer of buffers) {
            hash.update(buffer);
        }
        return hash.digest(output);
    }

    // Create a random hash
    static randomHash(length = 16) {
        return crypto.randomBytes(length).toString('hex');
    }

    // Add a method to indicate hash algorithm for version checking
    static getHashAlgorithm() {
        return 'blake2bp';
    }

    // Optimized batch processing for Blake2bp
    static batchProcess(items, preprocessor = null) {
        // Collect all items that need hashing
        const buffers = items.map(item => {
            if (preprocessor) {
                item = preprocessor(item);
            }
            return Buffer.isBuffer(item) ? item : Buffer.from(JSON.stringify(item));
        });

        // Process in optimal chunk sizes for Blake2bp
        const OPTIMAL_CHUNK = 4096; // Blake2bp works best with larger chunks
        const chunks = [];
        let currentChunk = [];

        for (const buffer of buffers) {
            currentChunk.push(buffer);
            const totalSize = currentChunk.reduce((sum, buf) => sum + buf.length, 0);
            
            if (totalSize >= OPTIMAL_CHUNK) {
                chunks.push(Buffer.concat(currentChunk));
                currentChunk = [];
            }
        }
        
        if (currentChunk.length > 0) {
            chunks.push(Buffer.concat(currentChunk));
        }

        // Hash each optimal chunk
        return chunks.map(chunk => this.hashBuffer(chunk));
    }
}

module.exports = Hasher;
