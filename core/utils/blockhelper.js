const crypto = require('crypto');
const Signer = require('./signer.js');  // For encoding/decoding strings

class BlockHelper {
    // Generate the hash for the block (using sha256)
    static generateHash(block) {
        // Remove dynamic properties that should not affect the block's identifier (e.g., signatures, timestamps)
        const blockData = BlockHelper.removeSignatures(block);

        // Sort the object keys and stringify it in a canonical way
        const canonicalData = BlockHelper.canonicalStringify(blockData);

        // Generate the hash using SHA-256
        return crypto.createHash('sha256').update(canonicalData).digest('hex');
    }

    // Sign the block's hash with the private key (Ed25519)
    static signBlock(privateKey, block) {
        const blockWithoutSignatures = this.removeSignatures(block);
        const signer = new Signer(privateKey);
        return signer.signMessage(BlockHelper.canonicalStringify(blockWithoutSignatures));
    }

    // Remove overhead from the block (for verification purposes)
    static removeSignatures(block) {
        // Remove signatures from the block (for verification purposes)
        const blockWithoutSignatures = { ...block };  // Clone the block to avoid mutation
        delete blockWithoutSignatures.validatorSignatures;  // Remove multiple signatures field
        delete blockWithoutSignatures.signature;    // Remove single signature field
        delete blockWithoutSignatures.hash; // Remove the hash as it's also not part of a users signed block
        delete blockWithoutSignatures.timestamp; // Remove the hash as it's also not part of a users signed block
        delete blockWithoutSignatures.delegatorTime; // Remove the hash as it's also not part of a users signed block

        return blockWithoutSignatures;
    }

    // Signature verification with the public key
    static verifySignatureWithPublicKey(block, signatureBase64, publicKey) {
        // Remove the signature fields before serialization
        const blockWithoutSignatures = BlockHelper.removeSignatures(block);

        // Serialize the block (ensure the same format as in signing)
        const serializedBlock = BlockHelper.canonicalStringify(blockWithoutSignatures);

        return Signer.verifySignatureWithPublicKey(serializedBlock, signatureBase64, publicKey);
    }

    // Helper method to validate if a node ID (public key) is valid (hexadecimal string)
    static isValidPublicKey(nodeId) {
        // Check if the node ID is a valid 64-character hexadecimal string
        const publicKeyRegex = /^[0-9a-f]{64}$/i; // Matches exactly 64 hex characters (case insensitive)
        return publicKeyRegex.test(nodeId);
    }

    // Sorts the object before stringifying it
    static canonicalStringify(obj) {
        const sortedObj = Object.keys(obj)
        .sort()
        .reduce((acc, key) => {
            acc[key] = obj[key];
            return acc;
        }, {});
        return JSON.stringify(sortedObj);
    }

    static mergeSignatures(block, newBlock) {
        // Loop through all signatures in the newBlock
        Object.entries(newBlock.validatorSignatures).forEach(([sigNodeId, signature]) => {
            // If this signature is not already in the block
            if (!block.validatorSignatures.hasOwnProperty(sigNodeId)) {
                // Verify the signature for validity
                const isValid = this.blockchain.blockValidator.verifySignatureWithPublicKey(block, signature, sigNodeId);

                if (isValid) {
                    // Add the valid signature to the pending block
                    block.validatorSignatures[sigNodeId] = signature;

                    // Sort signatures alphabetically by nodeId for consistency
                    const sortedSignatures = Object.entries(block.validatorSignatures)
                    .sort(([a], [b]) => a.localeCompare(b)) // Sort by nodeId
                    .reduce((acc, [key, value]) => {
                        acc[key] = value; // Rebuild the object with sorted entries
                        return acc;
                    }, {});

                    block.validatorSignatures = sortedSignatures;

                    console.log(`Added valid signature from node ${sigNodeId} to block ${newBlock.hash}.`);
                } else {
                    console.log(`Invalid signature from node ${sigNodeId} for block ${newBlock.hash}.`);
                }
            } else {
                console.log(`Signature from node ${sigNodeId} is already in block ${newBlock.hash}.`);
            }
        });

        return block;
    }
}

module.exports = BlockHelper;
