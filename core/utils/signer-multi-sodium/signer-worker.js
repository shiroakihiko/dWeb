const sodium = require('sodium-native');
const { parentPort } = require('worker_threads');

const messageBuffer = Buffer.allocUnsafe(sodium.crypto_hash_sha512_BYTES);
const signatureBuffer = Buffer.allocUnsafe(sodium.crypto_sign_BYTES);

// Handle messages from the main thread
parentPort.on('message', async function(data) {
    const { type, id, data: payload } = data;
    
    try {
        let result;
        switch (type) {
            case 'verify':
                const { message, signature, publicKey } = payload;
                const msgBufVerify = Buffer.from(message);
                const sigBufVerify = Buffer.from(signature, 'base64');
                const pubBufVerify = Buffer.from(publicKey, 'hex');
                
                result = sodium.crypto_sign_verify_detached(sigBufVerify, msgBufVerify, pubBufVerify);
                break;
                
            case 'sign':
                const { msg, privateKey } = payload;
                const msgBufSign = Buffer.from(msg);
                const keyBufSign = Buffer.from(privateKey, 'hex');
                
                sodium.crypto_sign_detached(signatureBuffer, msgBufSign, keyBufSign);
                result = signatureBuffer;
                break;
        }
        
        parentPort.postMessage({ id, result, error: null });
    } catch (error) {
        parentPort.postMessage({ id, result: null, error: error.message });
    }
}); 