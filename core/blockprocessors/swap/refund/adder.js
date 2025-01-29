const Ajv = require('ajv');
const BlockHelper = require('../../../utils/blockhelper.js');
const AccountUpdateManager = require('../../../ledger/account/accountupdatemanager.js');
const Decimal = require('decimal.js');
const crypto = require('crypto');

class RefundBlockAdder {
    constructor(network, validator) {
        this.network = network;
        this.validator = validator;
    }

    async addBlock(block, containerHash) {
        try {
            return await this.network.ledger.blocks.transaction(async () => {
                const accountManager = new AccountUpdateManager(this.network.ledger);
                const accountSender = await accountManager.getAccountUpdate(block.fromAccount);
                const accountDelegator = await accountManager.getAccountUpdate(block.delegator);
                const accountSwap = await accountManager.getAccountUpdate(block.toAccount);

                // Validate swap block
                const validBlock = await this.validator.validate(block);
                if(validBlock.state != 'VALID')
                    return validBlock;

                // Unlock the balance being swapped
                accountSender.updateBalance(new Decimal(accountSender.getBalance()).plus(accountSwap.getBalance()).toString());
                accountSender.setBlockCountIncrease(1);
                accountSender.updateLastBlockHash(block.hash);

                // Remove the balance from the swap account
                accountSwap.updateBalance(0);
                
                // Update swap account
                accountSwap.setBlockCountIncrease(1);
                accountSwap.updateLastBlockHash(block.hash);
                accountSwap.setCustomProperty('status', 'cancelled');

                // Handle delegator rewards
                if (block.delegator) {
                    accountDelegator.updateBalance(new Decimal(accountDelegator.getBalance())
                        .plus(block.fee.delegatorReward).toString());
                    accountDelegator.setBlockCountIncrease(1);
                    accountDelegator.updateLastBlockHash(block.hash);
                }

                // Save block
                const finalBlock = {...block, containerHash: containerHash};
                await this.network.ledger.blocks.put(finalBlock.hash, JSON.stringify(finalBlock));

                // Update statistics
                await this.network.ledger.stats.inc('swap', 1);
                await this.network.ledger.stats.inc('fee', block.fee.amount);
                await this.network.ledger.stats.inc('burned', block.fee.burnAmount);
                await this.network.ledger.stats.inc('delegatorRewards', block.fee.delegatorReward);

                // Remove callback to monitor swap completion/timeout
                await this.network.ledger.blockCallbacks.removeCallback(accountSwap.getCustomProperty('swapHash'));
                
                await accountManager.applyUpdates();

                // Notify target network
                this.network.node.sendTargetNetwork(block.targetNetwork, {
                    type: 'swapCancel',
                    swapHash: block.hash,
                    linkedSwapHash: block.linkedSwapHash,
                    block: block
                });

                return { state: 'BLOCK_ADDED' };
            });
        } catch (error) {
            this.network.node.error(`Failed to add swap block ${block.hash}:`, error);
            return { state: 'PROCESS_FAILURE', error: error };
        }
    }
}

module.exports = RefundBlockAdder;