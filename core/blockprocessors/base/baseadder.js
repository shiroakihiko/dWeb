const AccountUpdateManager = require('../../ledger/account/accountupdatemanager.js');
const Decimal = require('decimal.js');

class BaseBlockAdder {
    constructor(network, validator) {
        this.network = network;
        this.validator = validator;
    }

    async addBlock(block, containerHash) {
        this.accountManager = new AccountUpdateManager(this.network.ledger);
        try {
            return await this.network.ledger.blocks.transaction(async () => {
                // Validate block
                const validateResult = await this.validator.validateFinal(block);
                if (validateResult.state != 'VALID')
                    return validateResult;
                
                // Process accounts
                await this.processAccounts(block);
                
                // Store block
                // Set container hash for reference (needs to deleted for signature verification)
                const finalBlock = {...block, containerHash: containerHash};
                await this.network.ledger.blocks.put(finalBlock.hash, JSON.stringify(finalBlock));
                
                // Update stats
                await this.updateStats(block);

                // Apply account updates
                await this.accountManager.applyUpdates();

                // Post-processing
                await this.postProcess(block);

                return { state: 'BLOCK_ADDED' };
            });
        } catch (error) {
            if (this.network.node) {
                this.network.node.error('Error adding block', error);
            }
            return { state: 'PROCESS_FAILURE', error: error };
        }
    }

    // Default account processing - can be overridden by child classes
    async processAccounts(block) {
        const accountSender = await this.accountManager.getAccountUpdate(block.fromAccount);
        const accountRecipient = await this.accountManager.getAccountUpdate(block.toAccount);
        const accountDelegator = await this.accountManager.getAccountUpdate(block.delegator);
        console.log('Processing accounts for block:', block.hash);
        // Update sender
        if (block.fromAccount) {
            const senderBalance = new Decimal(accountSender.getBalance());
            const deductAmount = new Decimal(block.amount || 0);
            
            if (block.fee) {
                deductAmount.add(block.fee.amount || 0);
            }
            
            accountSender.updateBalance(senderBalance.minus(deductAmount).toString());
            accountSender.setBlockCountIncrease(1);
            accountSender.addBlockToHistory(block.hash);
            accountSender.initWithBlock(block);
        }

        // Update recipient
        if (block.toAccount) {
            if (block.amount) {
                accountRecipient.updateBalance(new Decimal(accountRecipient.getBalance()).add(block.amount).toString());
            }
            accountRecipient.setBlockCountIncrease(1);
            accountRecipient.addBlockToHistory(block.hash);
            accountRecipient.initWithBlock(block);
        }

        // Update delegator
        if (block.delegator && block.fee && block.fee.delegatorReward) {
            accountDelegator.updateBalance(new Decimal(accountDelegator.getBalance()).add(block.fee.delegatorReward).toString());
            accountDelegator.setBlockCountIncrease(1);
            accountDelegator.addBlockToHistory(block.hash);
            accountDelegator.initWithBlock(block);
        }
    }

    // Default stats update - can be overridden by child classes
    async updateStats(block) {
        if (block.amount) await this.network.ledger.stats.inc('send', block.amount);
        if (block.fee) {
            if (block.fee.amount) await this.network.ledger.stats.inc('fee', block.fee.amount);
            if (block.fee.burnAmount) await this.network.ledger.stats.inc('burned', block.fee.burnAmount);
            if (block.fee.delegatorReward) await this.network.ledger.stats.inc('delegatorRewards', block.fee.delegatorReward);
        }
        await this.network.ledger.stats.inc(`BLOCKS_ADDED[${block.type}]`, 1);
    }

    // Optional post-processing hook - can be overridden by child classes
    async postProcess(block) {
        // Default implementation does nothing
    }
}

module.exports = BaseBlockAdder; 