const { Worker } = require('worker_threads');
const path = require('path');
const Hasher = require('./hasher');
const blocked = require('blocked-at');
const sodium = require('sodium-native');
const msgpack = require('msgpack-lite');

const messageBuffer = Buffer.allocUnsafe(sodium.crypto_hash_sha512_BYTES);
const signatureBuffer = Buffer.allocUnsafe(sodium.crypto_sign_BYTES);

class Signer {
    static verificationCache = new Map();
    static cacheTimeout = 60000; // 60 seconds
    static maxCacheSize = 5000;
    static pendingTasks = new Map();
    
    static initialize() {
        /*blocked((time, stack) => {
            if(!JSON.stringify(stack).includes('deflate')) {
                console.log(`Blocked for ${time}ms, operation started here:`, stack);
            }
        });*/
    }

    static async signMessage(message, privateKey) {
        /*let messageHash;
        if (typeof message == 'object') {
            messageHash = await Hasher.hashBuffer(msgpack.encode(message));
        } else {
            messageHash = await Hasher.hashText(message);
        }*/
        const messageHash = await Hasher.hashText(message);

        const msgBufSign = Buffer.from(messageHash);
        const keyBufSign = Buffer.from(privateKey, 'hex');
        
        sodium.crypto_sign_detached(signatureBuffer, msgBufSign, keyBufSign);
        return Buffer.from(signatureBuffer).toString('base64');
    }

    static async verifySignatureWithPublicKey(message, signatureBase64, publicKey) {
        const cacheKey = await Hasher.hashText(`${message}:${signatureBase64}:${publicKey}`);
        const cached = this.verificationCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
            return cached.result;
        }

        /*let messageHash;
        if (typeof message == 'object') {
            messageHash = await Hasher.hashBuffer(msgpack.encode(message));
        } else {
            messageHash = await Hasher.hashText(message);
        }*/
        const messageHash = await Hasher.hashText(message);
        const msgBufVerify = Buffer.from(messageHash);
        const sigBufVerify = Buffer.from(signatureBase64, 'base64');
        const pubBufVerify = Buffer.from(publicKey, 'hex');
        
        const result = sodium.crypto_sign_verify_detached(sigBufVerify, msgBufVerify, pubBufVerify);
        this.verificationCache.set(cacheKey, {
            result,
            timestamp: Date.now()
        });

        return result;
    }

    static async batchVerifySignatures(messages, signatures, publicKeys) {
        // Convert messages to deterministic format
        const msgBuffers = messages.map(msg => 
            typeof msg === 'object' ? msgpack.encode(msg) : Buffer.from(msg)
        );
        
        // First check cache for all signatures
        const uncachedIndices = [];
        const results = new Array(messages.length);
        const cacheKeys = [];
        
        // Prepare cache keys for batch hashing
        const cacheInputs = msgBuffers.map((msg, i) => 
            `${msg}:${signatures[i]}:${publicKeys[i]}`
        );
        
        // Get all cache keys in one batch operation
        const batchedCacheKeys = await Hasher.hashTexts(cacheInputs);
        
        // Check cache with computed keys
        for (let i = 0; i < messages.length; i++) {
            const cached = this.verificationCache.get(batchedCacheKeys[i]);
            
            if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
                results[i] = cached.result;
            } else {
                uncachedIndices.push(i);
                cacheKeys[i] = batchedCacheKeys[i];
            }
        }

        // If everything was cached, return immediately
        if (uncachedIndices.length === 0) {
            return results;
        }

        // Batch hash all uncached messages
        const uncachedMessages = uncachedIndices.map(i => messages[i]);
        const messageHashes = await Hasher.hashTexts(uncachedMessages);

        // Verify uncached signatures
        for (let j = 0; j < uncachedIndices.length; j++) {
            const i = uncachedIndices[j];
            const msgBufVerify = Buffer.from(messageHashes[j]);
            const sigBufVerify = Buffer.from(signatures[i], 'base64');
            const pubBufVerify = Buffer.from(publicKeys[i], 'hex');
            
            const result = sodium.crypto_sign_verify_detached(
                sigBufVerify, 
                msgBufVerify, 
                pubBufVerify
            );

            // Cache the result
            this.verificationCache.set(cacheKeys[i], {
                result,
                timestamp: Date.now()
            });
            results[i] = result;
        }

        return results;
    }
}

// Initialize workers on startup
Signer.initialize();

module.exports = Signer;
