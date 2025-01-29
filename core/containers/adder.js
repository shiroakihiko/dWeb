const Ajv = require('ajv');
const Decimal = require('decimal.js');

class ContainerAdder {
    constructor(network, validator) {
        this.network = network;
        this.validator = validator;
        this.metrics = {
            lastAddDuration: 0,
            validationTime: 0,
            blockProcessingTime: 0,
            containerStorageTime: 0
        };
    }

    async addContainer(container) {
        const startTime = performance.now();
        try {
            return await this.network.ledger.containers.transaction(async () => {
                // Validation timing
                const validationStart = performance.now();
                const isValid = await this.validator.validateContainer(container);
                if (!isValid) {
                    return { state: 'INVALID_CONTAINER' };
                }

                if(container.previousContainerHash !== null) {
                    if(await this.validator.validateNetworkConfirmation(container) === false) {
                        return { state: 'INVALID_NETWORK_CONFIRMATION' };
                    }
                }
                this.metrics.validationTime = performance.now() - validationStart;

                if(container.previousContainerHash === null) {
                    if(await this.network.ledger.containers.getCount() !== 0) {
                        return { state: 'LEDGER_NOT_EMPTY' };
                    }
                }
                
                // Block processing timing
                const blockStart = performance.now();
                const sortedBlocks = [...container.blocks].sort((a, b) => a.timestamp - b.timestamp);
                
                for (const block of sortedBlocks) {
                    const result = await this.network.blockManager.addBlock(block, container.hash);
                    if(result.state !== 'BLOCK_ADDED' && result.state !== 'BLOCK_EXISTS') {
                        return result.state;
                    }
                }
                /*const blockResults = await Promise.all(
                    sortedBlocks.map(block => 
                        this.network.blockManager.addBlock(block, container.hash, accountManager)
                    )
                );*/
                this.metrics.blockProcessingTime = performance.now() - blockStart;

                /*
                const failedBlock = blockResults.find(result => 
                    result.state !== 'BLOCK_ADDED' && result.state !== 'BLOCK_EXISTS'
                );

                if (failedBlock) {
                    throw new Error(`Failed to add block: ${failedBlock.state}`);
                }*/

                // Container storage timing
                const storageStart = performance.now();
                const containerJson = {...container};
                containerJson.blocks = containerJson.blocks.map(block => block.hash);
                await this.network.ledger.addContainer(containerJson);
                await this.updateStats(containerJson);
                this.metrics.containerStorageTime = performance.now() - storageStart;

                this.metrics.lastAddDuration = performance.now() - startTime;
                
                // Log performance metrics
                this.network.node.debug('Container processing metrics:', {
                    totalTime: this.metrics.lastAddDuration.toFixed(2) + 'ms',
                    validation: this.metrics.validationTime.toFixed(2) + 'ms',
                    blockProcessing: this.metrics.blockProcessingTime.toFixed(2) + 'ms',
                    storage: this.metrics.containerStorageTime.toFixed(2) + 'ms',
                    blockCount: container.blocks.length
                });

                return { state: 'CONTAINER_ADDED' };
            });
        } catch (error) {
            this.network.node.error('Error adding container', error);
            return { state: 'PROCESS_FAILURE', error: error.message };
        }
    }

    async updateStats(containerJson) {
        await this.network.ledger.stats.inc('CONTAINERS_ADDED', 1);
        await this.network.ledger.stats.inc('BLOCKS_IN_CONTAINERS', containerJson.blocks.length);
    }

    getMetrics() {
        return {
            ...this.metrics,
            averageTimePerBlock: this.metrics.blockProcessingTime / this.metrics.lastBlockCount
        };
    }

    // TODO: Handle fork (not implemented)
    async handleFork(forkPoint, newChain) {
        try {
            return await this.network.ledger.containers.transaction(async () => {
                // 1. Find all containers after fork point
                const containers = await this.network.ledger.getContainersAfterHash(forkPoint);

                // 2. Revert containers in reverse order
                const containersReversed = containers.reverse();
                for (const container of containersReversed) {
                    const blocksToRevert = container.blocks;

                    // 3. Revert blocks in reverse order
                    for (const block of blocksToRevert.reverse()) {
                        const result = await this.network.blockManager.revertBlock(block);
                        if (result.state !== 'BLOCK_REVERTED') {
                            throw new Error(`Failed to revert block: ${result.state}`);
                        }
                    }
                }

                // 4. Apply new chain
                for (const container of newChain) {
                    const result = await this.addContainer(container);
                    if (result.state !== 'CONTAINER_ADDED') {
                        throw new Error(`Failed to add container: ${result.state}`);
                    }
                }

                return { state: 'FORK_RESOLVED' };
            });
        } catch (error) {
            this.network.node.error('Error handling fork', error);
            return { state: 'FORK_RESOLUTION_FAILED', error };
        }
    }
}

module.exports = ContainerAdder;

