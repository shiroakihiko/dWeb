const Signer = require('./signer.js');  // For encoding/decoding strings
const Block = require('../system/block/block.js');

class BlockHelper {
    // Generate the composite hash for the block.
    // The composite hash combines chain-linking data (previousBlockHash, timestamp, creator)
    // with the content summary (the merkleRoot) so that validators' signatures bind both.
    static async generateBlockHash(blockData) {
        // Build a temporary Block with the appropriate values.
        const block = new Block({
            previousBlockHash: blockData.previousBlockHash,
            actions: blockData.actions,
            timestamp: blockData.timestamp,
            creator: blockData.creator
        });

        return await block.generateAndSetHash();
    }

    // Sign the block's hash with the private key (Ed25519).
    static async signBlock(block, privateKey) {
        const hash = await BlockHelper.generateBlockHash(block);
        return await Signer.signMessage(hash, privateKey);
    }

    // Block Signature Verification
    static async verifySignatureWithPublicKey(block, signatureBase64, publicKey) {
        const hash = await BlockHelper.generateBlockHash(block);
        
        const result = await Signer.verifySignatureWithPublicKey(hash, signatureBase64, publicKey);
        return result;
    }
}

module.exports = BlockHelper;