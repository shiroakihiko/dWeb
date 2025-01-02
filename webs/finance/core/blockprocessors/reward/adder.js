const Ajv = require('ajv');
const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const AccountUpdateManager = require('../../../../../core/ledger/account/accountupdatemanager.js');
const Decimal = require('decimal.js');

class RewardBlockAdder {
    constructor(network, validator) {
        this.network = network;
        this.ledger = network.ledger;
        this.validator = validator;
    }

    async addBlock(block) {
        try {
            return await this.ledger.blocks.transaction(async () => {

                const accountManager = new AccountUpdateManager(this.ledger);
                const accountSender = accountManager.getAccountUpdate(block.fromAccount);
                const accountRecipient = accountManager.getAccountUpdate(block.toAccount);
                const accountDelegator = accountManager.getAccountUpdate(block.delegator);

                // Validate send block
                this.validator.validate(block);

                // Process send block and apply updates
                const senderBalance = new Decimal(accountSender.account.balance);
                accountSender.updateBalance(senderBalance.minus(block.amount).minus(block.fee).toString());
                accountSender.setBlockCountIncrease(1);
                accountSender.updateLastBlockHash(block.hash);

                accountRecipient.updateBalance(new Decimal(accountRecipient.getBalance()).add(block.amount).toString());
                accountRecipient.setBlockCountIncrease(1);
                accountRecipient.initWithBlock(block);
                accountRecipient.updateLastBlockHash(block.hash);

                accountDelegator.updateBalance(new Decimal(accountDelegator.getBalance()).add(block.delegatorReward).toString());
                accountDelegator.setBlockCountIncrease(1);
                accountDelegator.initWithBlock(block);
                accountDelegator.updateLastBlockHash(block.hash);

                await this.ledger.blocks.put(block.hash, JSON.stringify(block));

                this.ledger.stats.inc('comment', 1);
                this.ledger.stats.inc('send', block.amount);
                this.ledger.stats.inc('fee', block.fee);
                this.ledger.stats.inc('burned', block.burnAmount);
                this.ledger.stats.inc('delegatorRewards', block.delegatorReward);

                accountManager.applyUpdates();

                return { state: 'BLOCK_ADDED' };
            });
        } catch (error) {
            return { state: 'PROCESS_FAILURE' };
        }
    }
}

module.exports = RewardBlockAdder;
