const nacl = require('tweetnacl');  // Import tweetnacl for ED25519 signing
const naclUtil = require('tweetnacl-util');  // For encoding/decoding strings
const crypto = require('crypto');

class Signer {
    constructor(privateKeyHex) {
        // Convert the hex private key to Uint8Array using Buffer
        this.privateKey = Buffer.from(privateKeyHex, 'hex'); // Decode hex to a Uint8Array
        this.publicKey = nacl.sign.keyPair.fromSecretKey(this.privateKey).publicKey;
        
        // Initialize metrics
        this.metrics = {
            lastVerifyTime: 0,
            messageDecodeTime: 0,
            signatureDecodeTime: 0,
            publicKeyDecodeTime: 0,
            verificationTime: 0,
            totalVerifications: 0,
            averageVerifyTime: 0
        };
    }

    // Sign the message
    signMessage(message) {
        const messageBytes = naclUtil.decodeUTF8(message);
        const signedMessage = nacl.sign.detached(messageBytes, this.privateKey);
        return naclUtil.encodeBase64(signedMessage);  // Return signature as Base64 string
    }

    // Sign the message
    static signMessage(message, privateKey) {
        const privateKeyBuffer = Buffer.from(privateKey, 'hex');
        const messageBytes = naclUtil.decodeUTF8(message);
        const signedMessage = nacl.sign.detached(messageBytes, privateKeyBuffer);
        return naclUtil.encodeBase64(signedMessage);  // Return signature as Base64 string
    }

    // Verify the message signature
    verifySignature(message, signatureBase64) {
        const messageBytes = naclUtil.decodeUTF8(message);
        const signature = naclUtil.decodeBase64(signatureBase64);
        return nacl.sign.detached.verify(messageBytes, signature, this.publicKey);
    }

    // Verify the message signature
    verifySignatureWithPublicKey(message, signatureBase64, publicKey) {
        const startTime = performance.now();

        // Time message decoding
        const msgStart = performance.now();
        const messageBytes = naclUtil.decodeUTF8(message);
        this.metrics.messageDecodeTime = performance.now() - msgStart;

        // Time signature decoding
        const sigStart = performance.now();
        const signature = naclUtil.decodeBase64(signatureBase64);
        this.metrics.signatureDecodeTime = performance.now() - sigStart;

        // Time public key processing
        const keyStart = performance.now();
        const publicKeyBytes = Buffer.from(publicKey, 'hex');
        this.metrics.publicKeyDecodeTime = performance.now() - keyStart;

        // Time actual verification
        const verifyStart = performance.now();
        const result = nacl.sign.detached.verify(messageBytes, signature, publicKeyBytes);
        this.metrics.verificationTime = performance.now() - verifyStart;

        // Update overall metrics
        this.metrics.lastVerifyTime = performance.now() - startTime;
        this.metrics.totalVerifications++;
        this.metrics.averageVerifyTime = 
            (this.metrics.averageVerifyTime * (this.metrics.totalVerifications - 1) + 
             this.metrics.lastVerifyTime) / this.metrics.totalVerifications;

        // Log detailed metrics every 100 verifications
        /*if (this.metrics.totalVerifications % 100 === 0) {
            console.debug('Signature verification metrics:', {
                totalTime: `${this.metrics.lastVerifyTime.toFixed(2)}ms`,
                messageDecode: `${this.metrics.messageDecodeTime.toFixed(2)}ms`,
                signatureDecode: `${this.metrics.signatureDecodeTime.toFixed(2)}ms`,
                publicKeyDecode: `${this.metrics.publicKeyDecodeTime.toFixed(2)}ms`,
                verification: `${this.metrics.verificationTime.toFixed(2)}ms`,
                average: `${this.metrics.averageVerifyTime.toFixed(2)}ms`,
                totalVerifications: this.metrics.totalVerifications
            });
        }*/

        return result;
    }

    static verificationCache = new Map();
    static cacheTimeout = 30000; // 30 seconds
    static maxCacheSize = 1000;

    static verifySignatureWithPublicKey(message, signatureBase64, publicKey) {
        const startTime = performance.now();
        
        // Create cache key from all inputs
        const cacheKey = `${message}:${signatureBase64}:${publicKey}`;
        
        // Check cache
        const cached = this.verificationCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
            return cached.result;
        }

        // Perform verification
        const messageBytes = naclUtil.decodeUTF8(message);
        const signature = naclUtil.decodeBase64(signatureBase64);
        const publicKeyBytes = Buffer.from(publicKey, 'hex');
        
        const result = nacl.sign.detached.verify(messageBytes, signature, publicKeyBytes);
        
        // Cache result
        if (this.verificationCache.size >= this.maxCacheSize) {
            // Clear old entries
            const now = Date.now();
            for (const [key, value] of this.verificationCache.entries()) {
                if (now - value.timestamp >= this.cacheTimeout) {
                    this.verificationCache.delete(key);
                }
            }
            // If still too big, clear oldest entries
            if (this.verificationCache.size >= this.maxCacheSize) {
                const entries = Array.from(this.verificationCache.entries());
                entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
                entries.slice(0, entries.length / 2).forEach(([key]) => 
                    this.verificationCache.delete(key)
                );
            }
        }
        
        this.verificationCache.set(cacheKey, {
            result,
            timestamp: Date.now()
        });

        const totalTime = performance.now() - startTime;
        /*console.debug('Signature verification:', {
            totalTime: `${totalTime.toFixed(2)}ms`,
            cacheHit: false,
            messageLength: message.length
        });*/
        
        return result;
    }

    static async batchVerifySignatures(messages, signatures, publicKeys) {
        const startTime = performance.now();

        // Pre-decode all public keys at once
        const keyStart = performance.now();
        const publicKeyBytes = publicKeys.map(key => Buffer.from(key, 'hex'));
        const keyDecodeTime = performance.now() - keyStart;

        // Pre-decode all messages
        const msgStart = performance.now();
        const messageBytes = messages.map(msg => naclUtil.decodeUTF8(msg));
        const messageDecodeTime = performance.now() - msgStart;

        // Pre-decode all signatures
        const sigStart = performance.now();
        const signatureBytes = signatures.map(sig => naclUtil.decodeBase64(sig));
        const sigDecodeTime = performance.now() - sigStart;

        // Verify all signatures in parallel
        const verifyStart = performance.now();
        const results = await Promise.all(
            messageBytes.map((msg, i) => 
                nacl.sign.detached.verify(msg, signatureBytes[i], publicKeyBytes[i])
            )
        );
        const verifyTime = performance.now() - verifyStart;

        const totalTime = performance.now() - startTime;
        /*console.debug('Batch signature verification:', {
            totalTime: `${totalTime.toFixed(2)}ms`,
            keyDecode: `${keyDecodeTime.toFixed(2)}ms`,
            messageDecode: `${messageDecodeTime.toFixed(2)}ms`,
            signatureDecode: `${sigDecodeTime.toFixed(2)}ms`,
            verification: `${verifyTime.toFixed(2)}ms`,
            count: messages.length,
            msPerSignature: (totalTime / messages.length).toFixed(2)
        });*/

        return results;
    }

    static hashText(text) {
        return crypto.createHash('sha256').update(text).digest('hex');
    }

    getMetrics() {
        return {
            ...this.metrics,
            averageVerifyTime: `${this.metrics.averageVerifyTime.toFixed(2)}ms`,
            breakdownLastVerification: {
                messageDecode: `${this.metrics.messageDecodeTime.toFixed(2)}ms`,
                signatureDecode: `${this.metrics.signatureDecodeTime.toFixed(2)}ms`,
                publicKeyDecode: `${this.metrics.publicKeyDecodeTime.toFixed(2)}ms`,
                verification: `${this.metrics.verificationTime.toFixed(2)}ms`
            }
        };
    }
}

module.exports = Signer;
