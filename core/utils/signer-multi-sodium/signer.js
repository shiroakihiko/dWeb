const { Worker } = require('worker_threads');
const path = require('path');
const Hasher = require('./hasher');
const blocked = require('blocked-at');

class Signer {
    static verificationCache = new Map();
    static cacheTimeout = 30000; // 30 seconds
    static maxCacheSize = 1000;
    static workers = [];
    static workerIndex = 0;
    static pendingTasks = new Map();
    
    static initialize(numWorkers = 4) {
        blocked((time, stack) => {
            console.log(`Blocked for ${time}ms, operation started here:`, stack)
        });

        // Create worker pool
        for (let i = 0; i < numWorkers; i++) {
            const worker = new Worker(path.join(__dirname, 'signer-worker.js'));
            
            worker.on('message', ({ id, result, error }) => {
                const resolver = this.pendingTasks.get(id);
                if (resolver) {
                    this.pendingTasks.delete(id);
                    if (error) {
                        resolver.reject(new Error(error));
                    } else {
                        resolver.resolve(result);
                    }
                }
            });
            
            this.workers.push(worker);
        }
    }
    
    static getNextWorker() {
        const worker = this.workers[this.workerIndex];
        this.workerIndex = (this.workerIndex + 1) % this.workers.length;
        return worker;
    }
    
    static async executeWorkerTask(type, data) {
        const id = Math.random().toString(36).slice(2);
        const worker = this.getNextWorker();
        
        return new Promise((resolve, reject) => {
            this.pendingTasks.set(id, { resolve, reject });
            worker.postMessage({ type, id, data });
        });
    }

    static async signMessage(message, privateKey) {
        const signature = await this.executeWorkerTask('sign', {
            msg: Hasher.hashText(message),
            privateKey: privateKey
        });
        
        return Buffer.from(signature).toString('base64');
    }

    static async verifySignatureWithPublicKey(message, signatureBase64, publicKey) {
        const cacheKey = Hasher.hashText(`${message}:${signatureBase64}:${publicKey}`);
        const cached = this.verificationCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
            return cached.result;
        }

        const result = await this.executeWorkerTask('verify', {
            message: Hasher.hashText(message),
            signature: signatureBase64,
            publicKey: typeof publicKey === 'string' ? publicKey : publicKey.toString('hex')
        });

        this.verificationCache.set(cacheKey, {
            result,
            timestamp: Date.now()
        });

        return result;
    }

    static async batchVerifySignatures(messages, signatures, publicKeys) {
        // First check cache for all signatures
        const uncachedIndices = [];
        const results = new Array(messages.length);
        
        for (let i = 0; i < messages.length; i++) {
            const cacheKey = Hasher.hashText(`${messages[i]}:${signatures[i]}:${publicKeys[i]}`);
            const cached = this.verificationCache.get(cacheKey);
            
            if (cached && (Date.now() - cached.timestamp < this.cacheTimeout)) {
                results[i] = cached.result;
            } else {
                uncachedIndices.push(i);
            }
        }
        
        if (uncachedIndices.length > 0) {
            // Create a queue of work items
            const workQueue = uncachedIndices.map(idx => ({
                message: messages[idx],
                signature: signatures[idx],
                publicKey: typeof publicKeys[idx] === 'string' ? publicKeys[idx] : publicKeys[idx].toString('hex'),
                index: idx
            }));

            // Process work items in parallel across available workers
            const workerPromises = this.workers.map(async () => {
                while (workQueue.length > 0) {
                    const work = workQueue.shift();
                    if (!work) break;

                    const result = await this.executeWorkerTask('verify', {
                        message: Hasher.hashText(work.message),
                        signature: work.signature,
                        publicKey: work.publicKey
                    });

                    // Cache the result
                    const cacheKey = Hasher.hashText(`${work.message}:${work.signature}:${work.publicKey}`);
                    this.verificationCache.set(cacheKey, {
                        result,
                        timestamp: Date.now()
                    });
                    results[work.index] = result;
                }
            });

            await Promise.all(workerPromises);
        }
        
        return results;
    }
}

// Initialize workers on startup
Signer.initialize();

module.exports = Signer;
