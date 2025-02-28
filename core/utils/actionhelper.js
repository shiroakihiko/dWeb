const Signer = require('./signer.js');  // For encoding/decoding strings
const Hasher = require('./hasher.js');
const SharedHelper = require('./sharedhelper.js');

class ActionHelper {
    static prepareForHashing(action) {
        const actionData = ActionHelper.removeOverhead(action);
        return SharedHelper.canonicalStringify(actionData);
    }

    // Generate the hash for the action
    static async generateHash(action) {
        // Remove dynamic properties that should not affect the block's identifier (e.g., signatures, timestamps)
        const actionData = ActionHelper.removeOverhead(action);

        // Sort the object keys and stringify it in a canonical way
        const canonicalData = SharedHelper.canonicalStringify(actionData);

        // Generate the hash
        return await Hasher.hashText(canonicalData);
    }

    // Sign the action's hash with the private key (Ed25519)
    static async signAction(privateKey, action) {
        const actionWithoutSignatures = this.removeOverhead(action);
        return await Signer.signMessage(SharedHelper.canonicalStringify(actionWithoutSignatures), privateKey);
    }

    // Remove overhead from the action (for verification purposes)
    static removeOverhead(action) {
        // Remove signatures from the action (for verification purposes)
        const actionWithoutOverhead = { ...action };  // Clone the action to avoid mutation
        delete actionWithoutOverhead.hash; // Remove the hash as it's also not part of a users signed action
        delete actionWithoutOverhead.signatures;    // Remove signatures (not included in hash generation on action level (only on block level))
        delete actionWithoutOverhead.timestamp; // Remove the timestamp (node assigned)
        return actionWithoutOverhead;
    }

    // Signature verification with the public key
    static async verifySignatureWithPublicKey(action, signatureBase64, publicKey) {
        // Remove the signature fields before serialization
        const actionWithoutSignatures = ActionHelper.removeOverhead(action);

        // Serialize the action (ensure the same format as in signing)
        const serializedAction = SharedHelper.canonicalStringify(actionWithoutSignatures);

        return await Signer.verifySignatureWithPublicKey(serializedAction, signatureBase64, publicKey);
    }

    // Helper method to validate if a node ID (public key) is valid (hexadecimal string)
    static isValidPublicKey(nodeId) {
        // Check if the node ID is a valid 64-character hexadecimal string
        const publicKeyRegex = /^[0-9a-f]{64}$/i; // Matches exactly 64 hex characters (case insensitive)
        return publicKeyRegex.test(nodeId);
    }

    // Hash text using SHA-256
    static async hashText(text) {
        return await Hasher.hashText(text);
    }
}

module.exports = ActionHelper;
