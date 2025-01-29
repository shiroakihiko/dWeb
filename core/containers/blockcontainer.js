const crypto = require('crypto');

class BlockContainer {
    constructor(previousContainerHash) {
        this.hash = null; // Will be set after blocks are added
        this.previousContainerHash = previousContainerHash;
        this.blocks = []; // Array of transaction blocks
        this.timestamp = Date.now();
        this.validatorSignatures = {}; // Signatures from validators
        this.creator = null; // NodeId of the container creator
    }

    // Add a block to the container, maintaining fee-based ordering
    addBlock(block) {
        this.blocks.push(block);
        // Sort blocks by fee in descending order
        this.blocks.sort((a, b) => b.fee - a.fee);
    }

    // Calculate container hash based on sorted blocks
    calculateHash() {
        // Sort blocks by timestamp before hashing
        const sortedBlocks = [...this.blocks].sort((a, b) => a.timestamp - b.timestamp);
        const blockHashes = sortedBlocks.map(block => block.hash).join('');
        const data = this.previousContainerHash + blockHashes + this.timestamp + this.creator;
        this.hash = crypto.createHash('sha256').update(data).digest('hex');
        return this.hash;
    }

    toJson() {
        return {
            hash: this.hash,
            previousContainerHash: this.previousContainerHash,
            blocks: this.blocks,
            timestamp: this.timestamp,
            validatorSignatures: this.validatorSignatures,
            creator: this.creator
        };
    }
}

module.exports = BlockContainer; 