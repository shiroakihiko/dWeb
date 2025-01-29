const BaseBlockAdder = require('../../../../../core/blockprocessors/base/baseadder');
const Decimal = require('decimal.js');

class RewardBlockAdder extends BaseBlockAdder {
    constructor(network, validator) {
        super(network, validator);
    }

    async processAccounts(block) {
        const accountSender = await this.accountManager.getAccountUpdate(block.fromAccount);
        const accountRecipient = await this.accountManager.getAccountUpdate(block.toAccount);
        const accountDelegator = await this.accountManager.getAccountUpdate(block.delegator);

        // Only initialize sender with block, no balance deduction
        accountSender.initWithBlock(block);
        accountSender.setBlockCountIncrease(1);
        accountSender.updateLastBlockHash(block.hash);

        // Add reward to recipient
        accountRecipient.updateBalance(new Decimal(accountRecipient.getBalance()).add(block.amount).toString());
        accountRecipient.setBlockCountIncrease(1);
        accountRecipient.initWithBlock(block);
        accountRecipient.updateLastBlockHash(block.hash);

        // Update delegator without reward
        accountDelegator.setBlockCountIncrease(1);
        accountDelegator.initWithBlock(block);
        accountDelegator.updateLastBlockHash(block.hash);
    }

    async updateStats(block) {
        await this.network.ledger.stats.inc('TOTAL_REWARDS', block.amount);
        await this.network.ledger.stats.inc('SUPPLY', block.amount);
    }
}

module.exports = RewardBlockAdder;
