const ed = require('@noble/ed25519');
const { parentPort } = require('worker_threads');

// Handle messages from the main thread
parentPort.on('message', async function(data) {
    const { type, id, data: payload } = data;
    
    try {
        let result;
        switch (type) {
            case 'verify':
                const { message, signature, publicKey } = payload;
                result = await ed.verifyAsync(
                    Buffer.from(signature, 'base64'),
                    Buffer.from(message),
                    Buffer.from(publicKey, 'hex')
                );
                break;
                
            case 'sign':
                const { msg, privateKey } = payload;
                result = await ed.signAsync(
                    Buffer.from(msg),
                    Buffer.from(privateKey, 'hex')
                );
                break;
        }
        
        parentPort.postMessage({ id, result, error: null });
    } catch (error) {
        parentPort.postMessage({ id, result: null, error: error.message });
    }
}); 