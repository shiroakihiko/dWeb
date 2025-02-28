const crypto = require('crypto');
const { createBLAKE3 } = require('hash-wasm');

class Hasher {
    static #blake3Instance = null;
    static #initialized = false;
    static #initPromise = null;

    static async #ensureInitialized() {
        if (!this.#initialized) {
            if (!this.#initPromise) {
                this.#initPromise = createBLAKE3().then(instance => {
                    this.#blake3Instance = instance;
                    this.#initialized = true;
                });
            }
            await this.#initPromise;
        }
        return this.#blake3Instance;
    }

    // Initialize the hasher - call this at app startup
    static async initialize() {
        await this.#ensureInitialized();
    }

    // Create Blake3 hash from buffer input
    static async hashBuffer(buffer, length = 32, output = 'hex') {
        if (!this.#initialized) {
            throw new Error('Hasher not initialized. Call Hasher.init() first');
        }
        
        this.#blake3Instance.init();
        this.#blake3Instance.update(buffer);
        const hash = this.#blake3Instance.digest();
        return output === 'hex' ? hash : Buffer.from(hash, 'hex');
    }

    // Create Blake3 hash from string input
    static async hashText(input, length = 32, output = 'hex') {
        if (!this.#initialized) {
            throw new Error('Hasher not initialized. Call Hasher.init() first');
        }

        this.#blake3Instance.init();
        this.#blake3Instance.update(Buffer.from(input));
        const hash = this.#blake3Instance.digest();
        return output === 'hex' ? hash : Buffer.from(hash, 'hex');
    }

    // For batch hashing multiple items
    static async hashBuffers(buffers, length = 32, output = 'hex') {
        if (!this.#initialized) {
            throw new Error('Hasher not initialized. Call Hasher.init() first');
        }

        this.#blake3Instance.init();
        for (const buffer of buffers) {
            this.#blake3Instance.update(buffer);
        }
        const hash = this.#blake3Instance.digest();
        return output === 'hex' ? hash : Buffer.from(hash, 'hex');
    }

    // Create a random hash
    static randomHash(length = 16) {
        return crypto.randomBytes(length).toString('hex');
    }

    // Add a method to indicate hash algorithm for version checking
    static getHashAlgorithm() {
        return 'blake3';
    }

    // Batch processing
    static async batchTexts(items, output = 'hex') {
        if (!this.#initialized) {
            throw new Error('Hasher not initialized. Call Hasher.init() first');
        }

        let hashedEntries = [];
        for (const item of items) {
            this.#blake3Instance.init();
            this.#blake3Instance.update(Buffer.from(item));
            const hash = this.#blake3Instance.digest();
            hashedEntries.push(hash);
        }

        return hashedEntries;
    }

    // Save current hash state
    static saveState() {
        if (!this.#initialized) {
            throw new Error('Hasher not initialized. Call Hasher.init() first');
        }
        return this.#blake3Instance.save();
    }

    // Load previously saved hash state
    static loadState(state) {
        if (!this.#initialized) {
            throw new Error('Hasher not initialized. Call Hasher.init() first');
        }
        this.#blake3Instance.load(state);
    }

    // Add this method to Hasher class
    static async hashTexts(inputs, length = 32, output = 'hex') {
        if (!this.#initialized) {
            throw new Error('Hasher not initialized. Call Hasher.init() first');
        }

        // Process all inputs in a single hash operation
        this.#blake3Instance.init();
        for (const input of inputs) {
            this.#blake3Instance.update(Buffer.from(input));
            // Add a delimiter to prevent concatenation attacks
            this.#blake3Instance.update(Buffer.from([0]));
        }
        
        const combinedHash = this.#blake3Instance.digest();
        
        // Now generate individual hashes using the combined state
        const hashes = inputs.map((_, index) => {
            this.#blake3Instance.init();
            this.#blake3Instance.update(Buffer.from(combinedHash + index.toString()));
            const hash = this.#blake3Instance.digest();
            return output === 'hex' ? hash : Buffer.from(hash, 'hex');
        });

        return hashes;
    }
}

module.exports = Hasher;
