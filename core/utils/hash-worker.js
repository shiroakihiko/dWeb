const { parentPort } = require('worker_threads');
const { createBLAKE3 } = require('hash-wasm');

let blake3Instance = null;

async function initialize() {
    if (!blake3Instance) {
        blake3Instance = await createBLAKE3();
    }
}

async function processBatch(batch, output) {
    await initialize();
    return batch.map(item => {
        blake3Instance.init();
        blake3Instance.update(Buffer.from(item));
        const hash = blake3Instance.digest();
        return output === 'hex' ? hash : Buffer.from(hash, 'hex');
    });
}

async function processHashTexts(batch, output) {
    await initialize();
    
    // Create combined hash
    blake3Instance.init();
    for (const input of batch) {
        blake3Instance.update(Buffer.from(input));
        blake3Instance.update(Buffer.from([0]));
    }
    const combinedHash = blake3Instance.digest();

    // Generate individual hashes
    return batch.map((_, index) => {
        blake3Instance.init();
        blake3Instance.update(Buffer.from(combinedHash + index.toString()));
        const hash = blake3Instance.digest();
        return output === 'hex' ? hash : Buffer.from(hash, 'hex');
    });
}

parentPort.on('message', async (data) => {
    const { batch, output, mode } = data;
    const result = mode === 'hashTexts' 
        ? await processHashTexts(batch, output)
        : await processBatch(batch, output);
    parentPort.postMessage(result);
});