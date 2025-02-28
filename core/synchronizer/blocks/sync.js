const BlockHelper = require('../../utils/blockhelper');
const BlockSyncManager = require('./syncmanager');
const Block = require('../../system/block/block');
class BlockSyncer {
    constructor(network, onSyncCompleteCallback) {
        this.network = network;
        this.onSyncComplete = onSyncCompleteCallback;
        this.syncManager = new BlockSyncManager(network);
        
        this.state = {
            genesisBlock: null,
            blockChainFetched: false,
            syncComplete: false
        };

        this.retryDelay = 5000;
        this.syncTimer = null;
        this.maxRetries = 3; // Add max retries for each step
        this.currentRetries = 0;
    }

    async sync() {
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
        }

        this.network.node.verbose(`[Sync] Local last block hash: ${this.network.ledger.getLastBlockHash()}`);
        await this.checkAndSync();
        
        // Only schedule retry if we're not complete and haven't exceeded retries
        if (!this.state.syncComplete && this.currentRetries < this.maxRetries) {
            this.currentRetries++;
            this.syncTimer = setTimeout(() => this.sync(), this.retryDelay);
        } else if (!this.state.syncComplete) {
            this.network.node.error('[Sync] Max retries exceeded, sync failed');
            this.Stop();
            this.completeSync();
        }
    }

    async checkAndSync() {
        try {
            // Step 1: Get and verify genesis block if we don't have it
            if (!this.state.genesisBlock) {
                const block = this.network.ledger.getBlockWithActions(this.network.networkId);
                if (block) {
                    const validGenesis = await this.verifyGenesisBlock(block);
                    if (validGenesis) {
                        this.state.genesisBlock = block;
                        this.network.node.log('[Sync] Valid genesis block found in local ledger');
                        this.currentRetries = 0; // Reset retries on success
                    } else {
                        this.network.node.error('[Sync] Invalid local genesis block');
                        return;
                    }
                } else {
                    this.network.node.log('[Sync] Requesting genesis block from peers');
                    await this.requestGenesisBlock();
                    return;
                }
            }

            // Step 2: Get block chain if we haven't yet
            if (!this.state.blockChainFetched) {
                const success = await this.requestBlockChain();
                if (!success) {
                    this.network.node.warn('[Sync] Failed to get block chain, will retry');
                    return;
                }
                this.currentRetries = 0; // Reset retries on success
            }

            // Step 3: Process blocks in the chain and fetch their actions
            if (this.syncManager.hasUnprocessedBlocks()) {
                const processed = await this.processNextBlockBatch();
                if (!processed) {
                    this.network.node.warn('[Sync] Failed to process block batch, will retry');
                    return;
                }
                this.currentRetries = 0; // Reset retries on success
                return;
            }

            // Step 4: Complete sync if all blocks are processed
            await this.completeSync();

        } catch (error) {
            this.network.node.error('[Sync] Error during sync:', error);
            // Don't increment retries for network errors
            if (!error.toString().includes('NETWORK')) {
                this.currentRetries++;
            }
        }
    }

    async verifyGenesisBlock(block) {
        const parsedBlock = new Block(block);
        await parsedBlock.generateAndSetHash();

        // Verify block structure, signature, and hash
        if (!await this.network.consensus.blockProcessor.validateBlock(parsedBlock, { ignoreActionCheck: true, ignoreConfirmationCheck: true, ignoreGenesisExistsCheck: true })) {
            this.network.node.error('[Sync] Invalid genesis block');
            return false;
        }

        // Verify block hash matches networkId
        if (parsedBlock.hash !== this.network.networkId) {
            this.network.node.error('[Sync] Genesis block hash does not match networkId');
            return false;
        }

        return true;
    }

    async requestBlockChain() {
        const lastBlockHash = this.network.ledger.getLastBlockHash();
        
        // Find peers that are ahead of us
        const peerStates = this.getPeerStates();
        if (peerStates.length === 0) {
            this.network.node.warn('[Sync] No suitable peers found for block chain sync');
            return false;
        }

        // Try peers in order of how far ahead they are
        for (const peerState of peerStates) {
            try {
                const response = await this.network.node.sendToPeerAsync(peerState.peerId, {
                    type: 'getBlockChain',
                    startHash: lastBlockHash
                });

                if (!response.error && response.blocks && response.blocks.length > 0) {
                    // Verify the chain connects to our last block
                    const firstBlock = response.blocks[0];
                    if (firstBlock.previousBlockHash !== lastBlockHash) {
                        this.network.node.warn(`[Sync] Received invalid chain from peer ${peerState.peerId} - chain doesn't connect`);
                        continue;
                    }

                    // Verify the chain matches the peer's reported last hash
                    const lastBlock = response.blocks[response.blocks.length - 1];
                    if (lastBlock.hash !== peerState.lastHash) {
                        this.network.node.warn(`[Sync] Received invalid chain from peer ${peerState.peerId} - unexpected last hash`);
                        continue;
                    }

                    this.network.node.verbose(`[Sync] Received valid block chain with ${response.blocks.length} new blocks from peer ${peerState.peerId}`);
                    const outputChain = response.blocks[0].previousBlockHash + 
                        response.blocks.map(block => '->' + block.hash).join('');
                    this.network.node.verbose(`[Sync] Chain: ${outputChain}`);

                    // Add blocks to sync manager for processing
                    this.network.node.info(`[Sync] Adding ${response.blocks.length} blocks to sync manager queue`);
                    await this.syncManager.addHashesToFetch(response.blocks.map(block => block.hash));

                    this.state.blockChainFetched = true;
                    return true;
                }
            } catch (error) {
                this.network.node.warn(`[Sync] Failed to get block chain from peer ${peerState.peerId}:`, error);
            }
        }

        this.network.node.error('[Sync] Failed to get valid block chain from any peer');
        return false;
    }

    /**
     * Get states of all peers, sorted by how far ahead they are
     * @returns {Array<{peerId: string, lastHash: string, height: number}>}
     */
    getPeerStates() {
        const ourLastHash = this.network.ledger.getLastBlockHash();
        const peerStates = [];
        const peerTelemetry = this.network.node.peers.peerManager.getAllTelemetry(this.network.networkId);
        
        for (const [peerId, telemetry] of peerTelemetry) {
            if (telemetry.telemetry && 
                telemetry.telemetry.lastBlockHash && 
                telemetry.telemetry.blockCount && 
                telemetry.telemetry.lastBlockHash !== ourLastHash) {
                    
                peerStates.push({
                    peerId,
                    lastHash: telemetry.telemetry.lastBlockHash,
                    height: telemetry.telemetry.blockCount
                });
            }
        }

        // Sort peers by block count (highest first)
        return peerStates.sort((a, b) => b.height - a.height);
    }

    async requestGenesisBlock() {
        const peerStates = this.getPeerStates();
        
        for (const peerState of peerStates) {
            try {
                const response = await this.network.node.sendToPeerAsync(peerState.peerId, {
                    type: 'getBlockWithActions',
                    hash: this.network.networkId
                });
                if (!response.error && response.block) {
                    const block = response.block;
                    if (await this.verifyGenesisBlock(block)) {
                        this.state.genesisBlock = block;
                        this.network.node.log(`[Sync] Valid genesis block received from peer ${peerState.peerId}`);
                        this.syncManager.addBlock(block);
                        return true;
                    }
                }
            } catch (error) {
                this.network.node.error(`[Sync]`, error);
                this.network.node.verbose(`[Sync] Failed to get genesis block from peer ${peerState.peerId}`);
            }
        }

        this.network.node.error('[Sync] Failed to get valid genesis block from any peer');
        return false;
    }

    async processNextBlockBatch() {
        const blockHashes = this.syncManager.getNextFetchBatch();
        if (blockHashes.length === 0) return true; // Consider empty batch a success

        this.network.node.verbose(`[Sync] Processing batch of ${blockHashes.length} blocks`);
        try {
            this.getBlocksWithActions(blockHashes);
            return true;
        } catch (error) {
            this.network.node.error('[Sync] Failed to process block batch:', error);
            return false;
        }
    }

    async getBlocksWithActions(blockHashes) {
        const peers = Array.from(this.network.node.peers.peerManager.connectedNodes.keys());
        if (peers.length === 0) {
            this.network.node.warn('[Sync] No peers available for getting block actions');
            return;
        }

        // Randomize peers to avoid always hitting the same peers
        // In case a peer is offline, slow or not synced up
        peers.sort(() => Math.random() - 0.5);

        const blockRequests = this.distributeBlocks(blockHashes, peers.length);
        const promises = blockRequests.map((request, index) => {
            return this.requestBlocksWithActions(peers[index], request);
        });

        try {
            await Promise.all(promises);
        } catch (error) {
            this.network.node.error('[Sync] Error getting blocks with actions:', error);
        }
    }

    distributeBlocks(blockHashes, peerCount) {
        const chunks = Array(peerCount).fill().map(() => []);
        blockHashes.forEach((blockHash, index) => {
            chunks[index % peerCount].push(blockHash);
        });
        return chunks;
    }

    async requestBlocksWithActions(peerId, blockHashes) {
        const response = await this.network.node.sendToPeerAsync(peerId, {
            type: 'getBlocksWithActions',
            hashes: blockHashes
        });

        if (response.error) {
            this.network.node.error(`[Sync] Failed to get blocks with actions from peer ${peerId}:`, response.error);
            return;
        }

        this.network.node.info(`[Sync] Retrieved ${response.blocks.length} blocks from peer ${peerId}`);
        for (const block of response.blocks) {
            await this.syncManager.addBlock(block);
        }
    }

    async completeSync() {
        if (this.state.syncComplete) return;
        
        this.state.syncComplete = true;
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
            this.syncTimer = null;
        }
        
        this.onSyncComplete({
            genesisBlock: this.state.genesisBlock
        });
    }

    Stop() {
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
            this.syncTimer = null;
        }
    }
}

module.exports = BlockSyncer; 