const Ajv = require('ajv');
const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const AccountUpdateManager = require('../../../../../core/ledger/account/accountupdatemanager.js');
const Decimal = require('decimal.js');

class RewardBlockAdder {
    constructor(network, validator) {
        this.network = network;
        this.validator = validator;
    }

    async addBlock(block) {
        try {
            return await this.network.ledger.blocks.transaction(async () => {

                const accountManager = new AccountUpdateManager(this.network.ledger);
                const accountSender = accountManager.getAccountUpdate(block.fromAccount);
                const accountRecipient = accountManager.getAccountUpdate(block.toAccount);
                const accountDelegator = accountManager.getAccountUpdate(block.delegator);

                // Validate send block
                this.validator.validate(block);

                // Process send block and apply updates
                accountSender.initWithBlock(block);
                accountSender.setBlockCountIncrease(1);
                accountSender.updateLastBlockHash(block.hash);

                accountRecipient.updateBalance(new Decimal(accountRecipient.getBalance()).add(block.amount).toString());
                accountRecipient.setBlockCountIncrease(1);
                accountRecipient.initWithBlock(block);
                accountRecipient.updateLastBlockHash(block.hash);

                //accountDelegator.updateBalance(new Decimal(accountDelegator.getBalance()).add(block.delegatorReward).toString());
                accountDelegator.setBlockCountIncrease(1);
                accountDelegator.initWithBlock(block);
                accountDelegator.updateLastBlockHash(block.hash);

                await this.network.ledger.blocks.put(block.hash, JSON.stringify(block));

                this.network.ledger.stats.inc('comment', 1);
                this.network.ledger.stats.inc('reward', block.amount);
                this.network.ledger.stats.inc('supply', block.amount);

                accountManager.applyUpdates();

                return { state: 'BLOCK_ADDED' };
            });
        } catch (error) {
            this.network.node.error('Error', error);
            return { state: 'PROCESS_FAILURE', error: error };
        }
    }
}

module.exports = RewardBlockAdder;
