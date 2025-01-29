const EventEmitter = require('events');
const BlockBroadcaster = require('./blockbroadcaster');

class PendingBlockManager extends EventEmitter {
    constructor(network) {
        super();
        this.network = network;
        this.pendingBlocks = new Map();
        this.confirmedBlocks = new Set();
        this.confirmationCallbacks = new Map();
        this.blockBroadcaster = new BlockBroadcaster(network);
    }

    async addBlock(block, confirmationCallback = null) {
        if (confirmationCallback && this.confirmedBlocks.has(block.hash)) {
            confirmationCallback(null);
            return false;
        }

        if (this.pendingBlocks.has(block.hash)) {
            return true;
        }
        
        this.pendingBlocks.set(block.hash, block);
        if (confirmationCallback) {
            this.confirmationCallbacks.set(block.hash, confirmationCallback);
        }
        
        this.network.node.log(`Block ${block.hash} added to pending blocks.`);
        this.emit('block:added', block);
        return true;
    }

    async getBlocksForContainer(maxBlocks = 20) {
        const validBlocks = [];
        for (const block of this.pendingBlocks.values()) {
            const result = await this.network.blockManager.validateBlock(block);
            if (result.state == 'VALID') validBlocks.push(block);
            else this.network.node.warn(`Block ${block.hash} is invalid (${result.state}), skipping`);
        }

        return validBlocks
            .sort((a, b) => b.fee.amount - a.fee.amount)
            .slice(0, maxBlocks);
    }

    hasBlock(blockHash) {
        return this.pendingBlocks.has(blockHash);
    }

    getBlock(blockHash) {
        return this.pendingBlocks.get(blockHash);
    }

    removeConfirmedBlocks(blockHashes = []) {
        for (const hash of blockHashes) {
            const block = this.getBlock(hash);
            if (block) {
                this.pendingBlocks.delete(hash);
                this.confirmedBlocks.add(hash);
                this.emit('block:confirmed', block);
                
                const callback = this.confirmationCallbacks.get(hash);
                if (callback) {
                    callback(block);
                    this.confirmationCallbacks.delete(hash);
                }
            }
        }
    }

    requeueBlock(block) {
        if (!this.pendingBlocks.has(block.hash) && !this.confirmedBlocks.has(block.hash)) {
            this.pendingBlocks.set(block.hash, block);
            this.emit('block:requeued', block);
        }
    }

    getPendingBlockCount() {
        return this.pendingBlocks.size;
    }

    cleanup() {
        // Optional: Add cleanup logic for old pending blocks
        const now = Date.now();
        const maxAge = 3600000; // 1 hour

        for (const [hash, block] of this.pendingBlocks.entries()) {
            if (now - block.timestamp > maxAge) {
                this.pendingBlocks.delete(hash);
                this.emit('block:expired', block);
            }
        }
    }
}

module.exports = PendingBlockManager; 