const SignerClusterClient = require('./signer-cluster-client');
const SignerManager = require('./signer-manager');
const Hasher = require('./hasher');

class Signer {
    static verificationCache = new Map();
    static cacheTimeout = 60000;
    static maxCacheSize = 10000;
    static client = null;
    static initializing = false;
    static initPromise = null;
    
    static async initialize() {
        if (this.client) return;
        if (this.initializing) {
            return this.initPromise;
        }

        this.initializing = true;
        this.initPromise = (async () => {
            try {
                // First ensure service is running
                await SignerManager.initialize();
                
                // Create client and wait for connection
                this.client = new SignerClusterClient();
                
                console.log('Signer service initialized successfully');
            } catch (err) {
                this.client = null;
                this.initializing = false;
                throw err;
            }
            this.initializing = false;
        })();

        return this.initPromise;
    }

    static async signMessage(message, privateKey) {
        // Ensure initialization before any operation
        if (!this.client) {
            await this.initialize();
        }

        while (true) {
            try {
                let keyBytes = Buffer.from(privateKey, 'hex');
                if(keyBytes.length === 64) {
                    keyBytes = keyBytes.slice(0, 32);
                } else if(keyBytes.length !== 32) {
                    throw new Error(`Invalid private key length: expected 32 or 64 bytes, got ${keyBytes.length}`);
                }
                
                const messageHash = Hasher.hashText(message.toString());
                return await this.client.sign(
                    messageHash,
                    keyBytes.toString('hex')
                );
            } catch (err) {
                if (err.message.includes('Connection lost') || err.message.includes('not connected')) {
                    console.warn('Connection lost, reinitializing...');
                    this.client = null;
                    await this.initialize();
                }
                console.warn('Signing failed, retrying:', err.message);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    static async verifySignatureWithPublicKey(message, signatureBase64, publicKey) {
        while (true) {
            try {
                // Validate inputs with stack trace
                if (!message) {
                    const error = new Error('Message is required');
                    console.error('Invalid verification attempt:', {
                        messageType: message ? typeof message : 'undefined',
                        messageValue: message,
                        signatureType: signatureBase64 ? typeof signatureBase64 : 'undefined',
                        publicKeyType: publicKey ? typeof publicKey : 'undefined',
                        stack: error.stack // This will show where the call came from
                    });
                    throw error;
                }
                if (!signatureBase64) {
                    throw new Error('Signature is required');
                }
                if (!publicKey) {
                    throw new Error('Public key is required');
                }

                const cacheKey = Hasher.hashText(`${message}:${signatureBase64}:${publicKey}`);
                const cached = this.verificationCache.get(cacheKey);
                
                if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
                    return cached.result;
                }

                // Ensure message is converted to string safely
                let messageStr;
                try {
                    messageStr = Buffer.isBuffer(message) ? 
                        message.toString('utf8') : 
                        String(message);
                } catch (err) {
                    console.error('Message conversion failed:', {
                        message,
                        error: err.message,
                        stack: err.stack
                    });
                    throw new Error(`Failed to convert message: ${err.message}`);
                }

                const messageHash = Hasher.hashText(messageStr);
                const result = await this.client.verify(
                    messageHash,
                    signatureBase64,
                    typeof publicKey === 'string' ? publicKey : publicKey.toString('hex')
                );

                this.verificationCache.set(cacheKey, {
                    result,
                    timestamp: Date.now()
                });

                return result;
            } catch (err) {
                // Don't retry if inputs are invalid
                if (err.message.includes('required')) {
                    throw err;
                }

                console.warn('Verification failed, retrying:', {
                    error: err.message,
                    stack: err.stack,
                    messageType: message ? typeof message : 'undefined',
                    messageValue: message,
                    signatureType: signatureBase64 ? typeof signatureBase64 : 'undefined',
                    publicKeyType: publicKey ? typeof publicKey : 'undefined'
                });

                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    static async batchVerifySignatures(messages, signatures, publicKeys) {
        // Validate input arrays
        if (!Array.isArray(messages) || !Array.isArray(signatures) || !Array.isArray(publicKeys)) {
            throw new Error('All inputs must be arrays');
        }

        if (messages.length !== signatures.length || messages.length !== publicKeys.length) {
            throw new Error('Input arrays must have the same length');
        }

        // Process in larger batches
        const BATCH_SIZE = 200; // Up from 50
        const results = new Array(messages.length);
        
        // Pre-check cache for all messages
        const uncachedIndices = [];
        for (let i = 0; i < messages.length; i++) {
            const cacheKey = Hasher.hashText(
                `${messages[i]}:${signatures[i]}:${publicKeys[i]}`
            );
            const cached = this.verificationCache.get(cacheKey);
            
            if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
                results[i] = cached.result;
            } else {
                uncachedIndices.push(i);
            }
        }

        // Only process uncached verifications
        if (uncachedIndices.length > 0) {
            const batchMessages = uncachedIndices.map(i => messages[i]);
            const batchSignatures = uncachedIndices.map(i => signatures[i]);
            const batchPublicKeys = uncachedIndices.map(i => publicKeys[i]);

            const batchResults = await this.client.batchVerify(
                batchMessages,
                batchSignatures,
                batchPublicKeys
            );

            // Update cache and results
            batchResults.forEach((result, index) => {
                const actualIndex = uncachedIndices[index];
                results[actualIndex] = result;
                
                const cacheKey = Hasher.hashText(
                    `${messages[actualIndex]}:${signatures[actualIndex]}:${publicKeys[actualIndex]}`
                );
                this.verificationCache.set(cacheKey, {
                    result,
                    timestamp: Date.now()
                });
            });
        }
        
        return results;
    }

    static async destroy() {
        if (this.client) {
            await this.client.destroy();
            this.client = null;
        }
        this.initializing = false;
        this.initPromise = null;
        await SignerManager.shutdown();
    }
}

// Don't auto-initialize, let it happen on first use
module.exports = Signer;
