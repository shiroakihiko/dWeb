class ContainerSyncManager {
    constructor(network) {
        this.network = network;
        this.receivedContainers = new Map(); // hash -> container
        this.containerQueue = []; // Containers waiting for block fetching
        this.batchSize = 10; // Process 10 containers at a time
        this.processedHashes = new Set(); // Track processed container hashes
    }

    async addContainerToQueue(container) {
        // Don't add if already processed
        if (this.processedHashes.has(container.hash)) {
            this.network.node.verbose(`[Sync] Container ${container.hash} already processed, skipping`);
            return;
        }
        this.containerQueue.push(container);
    }

    getNextContainerBatch() {
        return this.containerQueue.splice(0, this.batchSize);
    }

    hasUnprocessedContainers() {
        return this.containerQueue.length > 0 || this.receivedContainers.size > 0;
    }

    async addContainer(container) {
        // Don't process if already processed
        if (this.processedHashes.has(container.hash)) {
            this.network.node.verbose(`[Sync] Container ${container.hash} already processed, skipping`);
            return;
        }

        this.network.node.verbose(`[Sync] Adding container ${container.previousContainerHash} -> ${container.hash}`);
        this.receivedContainers.set(container.hash, container);
        await this.processContainers();
    }

    async processContainers() {
        let processedAny = true;
        let processAttempts = 0;
        const maxAttempts = 3;
        
        while (processedAny && processAttempts < maxAttempts) {
            processedAny = false;
            processAttempts++;
            
            const lastContainerHash = await this.getLastProcessedHash();
            
            // Then process received containers
            for (const [hash, container] of this.receivedContainers) {
                if (container.previousContainerHash === lastContainerHash) {
                    const result = await this.network.consensus.containerProcessor.addContainer(container);
                    if (result.state === 'CONTAINER_ADDED') {
                        this.network.node.verbose(`[Sync] Added container ${container.hash} to ledger`);
                        this.receivedContainers.delete(hash);
                        this.processedHashes.add(hash);
                        processedAny = true;
                        break;
                    } else {
                        this.network.node.error(`[Sync] Failed to add container ${container.hash} to ledger: ${result.state}`);
                        this.receivedContainers.delete(hash);
                    }
                }
            }

            if (processedAny) {
                this.network.node.verbose(`[Sync] Processed containers, ${this.getUnprocessedCount()} remaining`);
            }
        }

        if (processAttempts >= maxAttempts && this.hasUnprocessedContainers()) {
            this.network.node.warn('[Sync] Max processing attempts reached with unprocessed containers remaining');
        }
    }

    async getLastProcessedHash() {
        return await this.network.ledger.getLastContainerHash();
    }

    isContainerProcessed(hash) {
        return this.processedHashes.has(hash);
    }

    getUnprocessedCount() {
        return this.containerQueue.length + this.receivedContainers.size;
    }
}

module.exports = ContainerSyncManager; 