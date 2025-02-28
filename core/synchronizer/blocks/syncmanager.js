class BlockSyncManager {
    constructor(network) {
        this.network = network;
        this.hashesToFetch = new Set(); // Hashes we need to fetch
        this.fetchingHashes = new Set(); // Hashes currently being fetched
        this.blocksToProcess = new Map(); // hash -> block (blocks with data ready to process)
        this.processedHashes = new Set(); // Hashes that have been processed
        this.batchSize = 25;
        this.processingBlocks = false;
    }

    async addHashesToFetch(hashes) {
        for (const hash of hashes) {
            if (!this.processedHashes.has(hash) && !this.hashesToFetch.has(hash)) {
                this.hashesToFetch.add(hash);
            }
        }
    }

    getNextFetchBatch() {
        const batch = [];
        for (const hash of this.hashesToFetch) {
            if (batch.length >= this.batchSize) break;
                batch.push(hash);
        }
        return batch;
    }

    async addBlock(block) {
        if (this.processedHashes.has(block.hash)) {
            this.hashesToFetch.delete(block.hash);
            return;
        }

        this.network.node.verbose(`[Sync] Received block data: ${block.previousBlockHash} -> ${block.hash}`);
        this.hashesToFetch.delete(block.hash);
        this.blocksToProcess.set(block.hash, block);
        
        await this.processBlocks();
    }

    async processBlocks() {
        if (this.processingBlocks)
            return;
        this.processingBlocks = true;

        let processed;
        do {
            processed = false;
            const lastHash = this.network.ledger.getLastBlockHash();
            const nextBlock = this.findNextBlock(lastHash);

            if (nextBlock) {
                try {
                    const result = await this.network.consensus.blockProcessor.addBlock(nextBlock);
                    if (result.state === 'BLOCK_ADDED') {
                        this.network.node.verbose(`[Sync] Added block ${nextBlock.hash} to ledger`);
                        this.blocksToProcess.delete(nextBlock.hash);
                        this.processedHashes.add(nextBlock.hash);
                        processed = true;
                    } else {
                        this.network.node.error(`[Sync] Failed to add block ${nextBlock.hash}: ${result.state}`);
                        this.blocksToProcess.delete(nextBlock.hash);
                    }
                } catch (error) {
                    this.network.node.error(`[Sync] Error processing block ${nextBlock.hash}:`, error);
                    this.blocksToProcess.delete(nextBlock.hash);
                }
            }
        } while (processed);

        this.processingBlocks = false;
    }

    findNextBlock(previousHash) {
        for (const [_, block] of this.blocksToProcess) {
            if (block.previousBlockHash === previousHash) {
                return block;
            }
        }
        return null;
    }

    hasUnprocessedBlocks() {
        return this.hashesToFetch.size > 0 || this.blocksToProcess.size > 0;
    }

    getUnprocessedCount() {
        return this.hashesToFetch.size + this.blocksToProcess.size;
    }
}

module.exports = BlockSyncManager; 