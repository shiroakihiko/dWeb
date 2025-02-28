const Ajv = require('ajv');
const Decimal = require('decimal.js');
const AccountUpdateManager = require('../../ledger/account/accountupdatemanager.js');

class BlockAdder {
    constructor(network, validator) {
        this.network = network;
        this.validator = validator;
        this.metrics = {
            lastAddDuration: 0,
            validationTime: 0,
            actionProcessingTime: 0,
            blockStorageTime: 0
        };
    }

    async addBlock(block) {
        const startTime = performance.now();
        try {
            const accountManager = new AccountUpdateManager(this.network.ledger);

            // Validation timing
            const validationStart = performance.now();
            const isValid = await this.validator.validateBlock(block);
            if (!isValid) {
                return { state: 'INVALID_BLOCK' };
            }
            this.metrics.validationTime = performance.now() - validationStart;
                
            // Action processing timing
            const actionStart = performance.now();

            // Collect all actions first
            const processedActions = [];
            for (const action of block.actions) {
                const result = await this.network.actionManager.processAction({action, blockHash: block.hash, accountManager});
                
                if(result.state !== 'ACTION_ADDED' && result.state !== 'ACTION_EXISTS') {
                    return result.state;
                }
                processedActions.push(result.action);
            }
            
            // Store all actions in one go
            await this.network.ledger.actions.transaction(async () => {
                for (const action of processedActions) {
                    const finalAction = { ...action, blockHash: block.hash };
                    this.network.ledger.actions.put(finalAction.hash, finalAction);
                }
            });
            // Bulk write actions to DB
            this.metrics.actionProcessingTime = performance.now() - actionStart;

            const result = await this.network.ledger.blocks.transaction(async () => {
                // Block storage timing
                const storageStart = performance.now();
                this.network.ledger.addBlock(block);
                this.updateStats(block);

                this.metrics.blockStorageTime = performance.now() - storageStart;
                this.metrics.lastAddDuration = performance.now() - startTime;
                
                // Log performance metrics
                this.network.node.debug('Block processing metrics:', {
                    totalTime: this.metrics.lastAddDuration.toFixed(2) + 'ms',
                    validation: this.metrics.validationTime.toFixed(2) + 'ms',
                    actionProcessing: this.metrics.actionProcessingTime.toFixed(2) + 'ms',
                    storage: this.metrics.blockStorageTime.toFixed(2) + 'ms',
                    actionCount: block.actions.length
                });

                return { state: 'BLOCK_ADDED' };
            });
            if(result.state === 'BLOCK_ADDED') {
                await accountManager.applyUpdates();
            }
            return result;
        } catch (error) {
            this.network.node.error('Error adding block', error);
            return { state: 'PROCESS_FAILURE', error: error.message };
        }
    }
    
    async updateStats(block) {
        const totals = {
            fee: new Decimal(0),
            burned: new Decimal(0),
            delegatorRewards: new Decimal(0)
        };

        // Track instruction type amounts
        const instructionTotals = new Map();

        for (const action of block.actions) {
            if (action.instruction.amount) {
                const type = action.instruction.type;
                if (!instructionTotals.has(type)) {
                    instructionTotals.set(type, new Decimal(0));
                }
                instructionTotals.set(type, instructionTotals.get(type).plus(action.instruction.amount));
            }

            if (action.instruction.fee) {
                if (action.instruction.fee.amount) {
                    totals.fee = totals.fee.plus(action.instruction.fee.amount);
                }
                if (action.instruction.fee.burnAmount) {
                    totals.burned = totals.burned.plus(action.instruction.fee.burnAmount);
                }
                if (action.instruction.fee.delegatorReward) {
                    totals.delegatorRewards = totals.delegatorRewards.plus(action.instruction.fee.delegatorReward);
                }
            }
        }

        // Update instruction type totals
        for (const [type, amount] of instructionTotals) {
            await this.network.ledger.stats.inc(type, amount.toString());
        }

        // Update fee totals
        await this.network.ledger.stats.inc('fee', totals.fee.toString());
        await this.network.ledger.stats.inc('burned', totals.burned.toString());
        await this.network.ledger.stats.inc('delegatorRewards', totals.delegatorRewards.toString());

        // Update action and block counts
        await this.network.ledger.stats.inc('ACTIONS_ADDED', block.actions.length.toString());
        await this.network.ledger.stats.inc('BLOCKS_ADDED', '1');
        await this.network.ledger.stats.inc('ACTIONS_IN_BLOCKS', block.actions.length.toString());
    }

    getMetrics() {
        return {
            ...this.metrics,
            averageTimePerAction: this.metrics.actionProcessingTime / this.metrics.lastActionCount
        };
    }

    // TODO: Handle fork (not implemented)
    async handleFork(forkPoint, newChain) {
        try {
            return await this.network.ledger.blocks.transaction(async () => {
                // 1. Find all blocks after fork point
                const blocks = this.network.ledger.getBlocksAfterHash(forkPoint);

                // 2. Revert blocks in reverse order
                const blocksReversed = blocks.reverse();
                for (const block of blocksReversed) {
                    const actionsToRevert = block.actions;

                    // 3. Revert actions in reverse order
                    for (const action of actionsToRevert.reverse()) {
                        const result = await this.network.actionManager.revertAction(action);
                        if (result.state !== 'ACTION_REVERTED') {
                            throw new Error(`Failed to revert action: ${result.state}`);
                        }
                    }
                }

                // 4. Apply new chain
                for (const block of newChain) {
                    const result = await this.addBlock(block);
                    if (result.state !== 'BLOCK_ADDED') {
                        throw new Error(`Failed to add block: ${result.state}`);
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

module.exports = BlockAdder;

