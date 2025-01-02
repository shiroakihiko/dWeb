const nacl = require('tweetnacl');  // Import tweetnacl for ED25519 signing
const naclUtil = require('tweetnacl-util');  // For encoding/decoding strings

class Signer {
    constructor(privateKeyHex) {
        // Convert the hex private key to Uint8Array using Buffer
        this.privateKey = Buffer.from(privateKeyHex, 'hex'); // Decode hex to a Uint8Array
        this.publicKey = nacl.sign.keyPair.fromSecretKey(this.privateKey).publicKey;
    }

    // Sign the message
    signMessage(message) {
        const messageBytes = naclUtil.decodeUTF8(message);
        const signedMessage = nacl.sign.detached(messageBytes, this.privateKey);
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
        const messageBytes = naclUtil.decodeUTF8(message);
        const signature = naclUtil.decodeBase64(signatureBase64);
        return nacl.sign.detached.verify(messageBytes, signature, Buffer.from(publicKey, 'hex'));
    }
    // Verify the message signature
    static verifySignatureWithPublicKey(message, signatureBase64, publicKey) {
        const messageBytes = naclUtil.decodeUTF8(message);
        const signature = naclUtil.decodeBase64(signatureBase64);
        return nacl.sign.detached.verify(messageBytes, signature, Buffer.from(publicKey, 'hex'));
    }
}

module.exports = Signer;
