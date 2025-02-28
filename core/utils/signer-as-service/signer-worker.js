const ed = require('@noble/ed25519');
const cluster = require('cluster');
const { parentPort, isMainThread } = require('worker_threads');

// Pre-compile common buffer conversions and cache common sizes
const bufferPool = new Map();
const getBuffer = (size) => {
    if (!bufferPool.has(size)) {
        bufferPool.set(size, Buffer.allocUnsafe(size));
    }
    return bufferPool.get(size);
};

// Optimized batch verification
async function batchVerify(messages, signatures, publicKeys) {
    const results = new Array(messages.length);
    const batchSize = 100; // Smaller batches, processed more frequently
    
    // Process in smaller chunks but more frequently
    for (let i = 0; i < messages.length; i += batchSize) {
        const end = Math.min(i + batchSize, messages.length);
        const promises = new Array(end - i);
        
        // Direct verification without extra Promise wrapping
        for (let j = i; j < end; j++) {
            const msg = messages[j];
            const sig = signatures[j];
            const key = publicKeys[j];
            
            // Reuse buffers when possible
            promises[j - i] = ed.verifyAsync(
                Buffer.from(sig, 'base64'),
                Buffer.from(msg),
                Buffer.from(key, 'hex')
            ).then(result => {
                results[j] = result;
            });
        }
        
        // Process batch
        await Promise.all(promises);
    }

    return results;
}

// Function to handle signing/verification requests
async function handleRequest(data) {
    const { type, payload, batch } = data;
    try {
        switch (type) {
            case 'batchVerify':
                if (!batch) throw new Error('Batch data required');
                return { 
                    result: await batchVerify(
                        batch.messages, 
                        batch.signatures, 
                        batch.publicKeys
                    ), 
                    error: null 
                };

            case 'verify': {
                const { message, signature, publicKey } = payload;
                return {
                    result: await ed.verifyAsync(
                        Buffer.from(signature, 'base64'),
                        Buffer.from(message),
                        Buffer.from(publicKey, 'hex')
                    ),
                    error: null
                };
            }
                
            case 'sign': {
                const { message: signMessage, privateKey } = payload;
                const sig = await ed.signAsync(
                    Buffer.from(signMessage),
                    Buffer.from(privateKey, 'hex')
                );
                return {
                    result: Buffer.from(sig).toString('base64'),
                    error: null
                };
            }
                
            default:
                throw new Error('Unknown request type');
        }
    } catch (error) {
        return { result: null, error: error.message };
    }
}

if (!cluster.isPrimary && cluster.isWorker) {
    // --- Begin modification: immediately process messages instead of queuing them ---
    process.on('message', async (data) => {
        try {
            const response = await handleRequest(data);
            process.send({ id: data.id, ...response });
        } catch (err) {
            process.send({ 
                id: data.id, 
                result: null, 
                error: err.message 
            });
        }
    });
    // --- End modification ---
} else if (!isMainThread && parentPort) {
    // --- Begin modification: immediately process messages in worker threads ---
    parentPort.on('message', async (data) => {
        try {
            const response = await handleRequest(data);
            parentPort.postMessage({ id: data.id, ...response });
        } catch (err) {
            parentPort.postMessage({ 
                id: data.id, 
                result: null, 
                error: err.message 
            });
        }
    });
    // --- End modification ---
} 