const ContainerHelper = require('../../utils/containerhelper');
const ContainerSyncManager = require('./syncmanager');

class ContainerSyncer {
    constructor(network, onSyncCompleteCallback) {
        this.network = network;
        this.onSyncComplete = onSyncCompleteCallback;
        this.syncManager = new ContainerSyncManager(network);
        
        this.state = {
            genesisContainer: null,
            containerChainFetched: false,
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

        this.network.node.verbose(`[Sync] Local last container hash: ${await this.network.ledger.getLastContainerHash()}`);
        await this.checkAndSync();
        
        // Only schedule retry if we're not complete and haven't exceeded retries
        if (!this.state.syncComplete && this.currentRetries < this.maxRetries) {
            this.currentRetries++;
            this.syncTimer = setTimeout(() => this.sync(), this.retryDelay);
        } else if (!this.state.syncComplete) {
            this.network.node.error('[Sync] Max retries exceeded, sync failed');
            this.stop();
            this.completeSync();
        }
    }

    async checkAndSync() {
        try {
            // Step 1: Get and verify genesis container if we don't have it
            if (!this.state.genesisContainer) {
                const container = await this.network.ledger.getContainerWithBlocks(this.network.networkId);
                if (container) {
                    if (await this.verifyGenesisContainer(container)) {
                        this.state.genesisContainer = container;
                        this.network.node.log('[Sync] Valid genesis container found in local ledger');
                        this.currentRetries = 0; // Reset retries on success
                    } else {
                        this.network.node.error('[Sync] Invalid local genesis container');
                        return;
                    }
                } else {
                    this.network.node.log('[Sync] Requesting genesis container from peers');
                    await this.requestGenesisContainer();
                    return;
                }
            }

            // Step 2: Get container chain if we haven't yet
            if (!this.state.containerChainFetched) {
                const success = await this.requestContainerChain();
                if (!success) {
                    this.network.node.warn('[Sync] Failed to get container chain, will retry');
                    return;
                }
                this.currentRetries = 0; // Reset retries on success
            }

            // Step 3: Process containers in the chain and fetch their blocks
            if (this.syncManager.hasUnprocessedContainers()) {
                const processed = await this.processNextContainerBatch();
                if (!processed) {
                    this.network.node.warn('[Sync] Failed to process container batch, will retry');
                    return;
                }
                this.currentRetries = 0; // Reset retries on success
                return;
            }

            // Step 4: Complete sync if all containers are processed
            await this.completeSync();

        } catch (error) {
            this.network.node.error('[Sync] Error during sync:', error);
            // Don't increment retries for network errors
            if (!error.toString().includes('NETWORK')) {
                this.currentRetries++;
            }
        }
    }

    async verifyGenesisContainer(container) {
        // Verify container structure, signature, and hash
        if (!await this.network.consensus.containerProcessor.validateContainer(container, { ignoreBlockCheck: true })) {
            this.network.node.error('[Sync] Invalid genesis container');
            return false;
        }

        // Verify container hash matches networkId
        if (ContainerHelper.generateContainerHash(container) !== this.network.networkId) {
            this.network.node.error('[Sync] Genesis container hash does not match networkId');
            return false;
        }

        return true;
    }

    async requestGenesisContainer() {
        const response = await this.network.node.sendToRandomPeerAsync({
            type: 'getContainerWithBlocks',
            hash: this.network.networkId
        });

        if (response.error || !response.container) {
            this.network.node.error('[Sync] Failed to get genesis container:', response);
            return;
        }

        const container = response.container;
        if (await this.verifyGenesisContainer(container)) {
            this.state.genesisContainer = container;
            this.network.node.log('[Sync] Valid genesis container received');
            this.syncManager.addContainer(container);
        } else {
            this.network.node.error('[Sync] Invalid genesis container verification');
        }
    }

    async requestContainerChain() {
        const lastContainerHash = await this.network.ledger.getLastContainerHash();
        const response = await this.network.node.sendToRandomPeerAsync({
            type: 'getContainerChain',
            startHash: lastContainerHash
        });

        if (response.error || !response.containers) {
            this.network.node.error('[Sync] Failed to get container chain:', response);
            return false;
        }
        
        if(response.containers.length > 0) {
            const targetHash = response.containers[response.containers.length - 1].hash;
            this.network.node.verbose(`[Sync] Received container chain with ${response.containers.length} new containers, target hash: ${targetHash}`);
            const outputChain = response.containers[0].previousContainerHash+'->'+response.containers.map(container => '->'+container.hash).join('');
            this.network.node.verbose(`[Sync] Output chain: ${outputChain}`);
        } else {
            this.network.node.verbose(`[Sync] Received no new containers from peer`);
        }
        
        // Add containers to sync manager for processing
        for (const container of response.containers) {
            await this.syncManager.addContainerToQueue(container);
        }
        
        this.state.containerChainFetched = true;
        return true;
    }

    async processNextContainerBatch() {
        const containers = this.syncManager.getNextContainerBatch();
        if (containers.length === 0) return true; // Consider empty batch a success

        this.network.node.verbose(`[Sync] Processing batch of ${containers.length} containers`);
        try {
            await this.getContainersWithBlocks(containers);
            return true;
        } catch (error) {
            this.network.node.error('[Sync] Failed to process container batch:', error);
            return false;
        }
    }

    async getContainersWithBlocks(containers) {
        const peers = Array.from(this.network.node.peers.peerManager.connectedNodes.keys());
        if (peers.length === 0) {
            this.network.node.warn('[Sync] No peers available for getting container blocks');
            return;
        }

        const containerRequests = this.distributeContainers(containers, peers.length);
        const promises = containerRequests.map((request, index) => {
            return this.requestContainersWithBlocks(peers[index], request);
        });

        try {
            await Promise.all(promises);
        } catch (error) {
            this.network.node.error('[Sync] Error getting containers with blocks:', error);
        }
    }

    distributeContainers(containers, peerCount) {
        const chunks = Array(peerCount).fill().map(() => []);
        containers.forEach((container, index) => {
            chunks[index % peerCount].push(container.hash);
        });
        return chunks;
    }

    async requestContainersWithBlocks(peerId, containerHashes) {
        const response = await this.network.node.sendToPeerAsync(peerId, {
            type: 'getContainersWithBlocks',
            hashes: containerHashes
        });

        if (response.error) {
            this.network.node.error(`[Sync] Failed to get containers with blocks from peer ${peerId}:`, response.error);
            return;
        }

        for (const container of response.containers) {
            await this.syncManager.addContainer(container);
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
            genesisContainer: this.state.genesisContainer
        });
    }

    stop() {
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
            this.syncTimer = null;
        }
    }
}

module.exports = ContainerSyncer; 