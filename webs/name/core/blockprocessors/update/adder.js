const BaseBlockAdder = require('../../../../../core/blockprocessors/base/baseadder');

class UpdateBlockAdder extends BaseBlockAdder {
    constructor(network, validator) {
        super(network, validator);
    }

    async processAccounts(block) {
        const accountSender = await this.accountManager.getAccountUpdate(block.fromAccount);
        const domainAccount = await this.accountManager.getAccountUpdate(block.toAccount);
        const accountDelegator = await this.accountManager.getAccountUpdate(block.delegator);

        // Update sender
        accountSender.initWithBlock(block);
        accountSender.setBlockCountIncrease(1);
        accountSender.updateLastBlockHash(block.hash);

        // Update domain entries
        domainAccount.setBlockCountIncrease(1);
        domainAccount.initWithBlock(block);
        domainAccount.updateLastBlockHash(block.hash);
        domainAccount.setCustomProperty('entries', block.entries);

        // Update delegator
        accountDelegator.setBlockCountIncrease(1);
        accountDelegator.initWithBlock(block);
        accountDelegator.updateLastBlockHash(block.hash);
    }
}

module.exports = UpdateBlockAdder;