
async function setEncryptionKey(channelKey) {
    encryptionKey = await deriveKeyFromPassword(channelKey);
    console.log("Encryption key set.");
}

async function deriveKeyFromPassword(password) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: encoder.encode('some_salt'), iterations: 100000, hash: 'SHA-256' },
        keyMaterial, { name: 'AES-GCM', length: 128 }, false, ['encrypt', 'decrypt']
    );
}