const AccountUpdateManager = require('../../ledger/account/accountupdatemanager.js');
const Decimal = require('decimal.js');

class BaseBlockReverter {
    constructor(network, validator) {
        this.network = network;
        this.validator = validator;
    }
    
    ///////////////////////
    /// Todo: Not implemented yet (reverting changes in case of a fork)
    ///////////////////////

    async revertBlock(block) {
        this.accountManager = new AccountUpdateManager(this.network.ledger);
        
        try {
            return await this.network.ledger.blocks.transaction(async () => {
                // 1. Revert account changes
                await this.revertAccountChanges(block);
                
                // 2. Remove block from history
                await this.removeFromHistory(block);
                
                // 3. Update stats (decrease counters)
                await this.revertStats(block);
                
                // 4. Delete the block
                await this.network.ledger.blocks.delete(block.hash);
                
                return { state: 'BLOCK_REVERTED' };
            });
        } catch (error) {
            return { state: 'REVERT_FAILURE', error };
        }
    }

    async revertAccountChanges(block) {
        const accountSender = await this.accountManager.getAccountUpdate(block.fromAccount);
        const accountRecipient = await this.accountManager.getAccountUpdate(block.toAccount);
        const accountDelegator = await this.accountManager.getAccountUpdate(block.delegator);

        // Revert sender
        if (block.fromAccount) {
            const senderBalance = new Decimal(accountSender.getBalance());
            const addBackAmount = new Decimal(block.amount || 0);
            
            if (block.fee) {
                addBackAmount.add(block.fee.amount || 0);
            }
            
            accountSender.updateBalance(senderBalance.plus(addBackAmount).toString());
            accountSender.setBlockCountIncrease(-1);
        }

        // Revert recipient
        if (block.toAccount && block.amount) {
            const recipientBalance = new Decimal(accountRecipient.getBalance());
            accountRecipient.updateBalance(recipientBalance.minus(block.amount).toString());
            accountRecipient.setBlockCountIncrease(-1);
        }

        // Revert delegator
        if (block.delegator && block.fee && block.fee.delegatorReward) {
            const delegatorBalance = new Decimal(accountDelegator.getBalance());
            accountDelegator.updateBalance(delegatorBalance.minus(block.fee.delegatorReward).toString());
            accountDelegator.setBlockCountIncrease(-1);
        }

        // Apply account updates
        await this.accountManager.applyUpdates();
    }

    async removeFromHistory(block) {
        // Remove block from account histories
        const accounts = [block.fromAccount, block.toAccount, block.delegator]
            .filter(account => account); // Remove nulls
            
        for (const accountId of accounts) {
            const account = await this.network.ledger.getAccount(accountId);
            if (account && account.history) {
                account.history = account.history.filter(hash => hash !== block.hash);
                await this.network.ledger.accounts.put(
                    accountId, 
                    JSON.stringify(account)
                );
            }
        }
    }

    async revertStats(block) {
        if (block.amount) await this.network.ledger.stats.dec('send', block.amount);
        if (block.fee) {
            if (block.fee.amount) await this.network.ledger.stats.dec('fee', block.fee.amount);
            if (block.fee.burnAmount) await this.network.ledger.stats.dec('burned', block.fee.burnAmount);
            if (block.fee.delegatorReward) await this.network.ledger.stats.dec('delegatorRewards', block.fee.delegatorReward);
        }
        await this.network.ledger.stats.dec(`BLOCKS_ADDED[${block.type}]`, 1);
    }
}

module.exports = BaseBlockReverter; 
