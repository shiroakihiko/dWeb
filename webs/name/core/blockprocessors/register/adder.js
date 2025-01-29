const BaseBlockAdder = require('../../../../../core/blockprocessors/base/baseadder');

class RegisterBlockAdder extends BaseBlockAdder {
    constructor(network, validator) {
        super(network, validator);
    }

    async processAccounts(block) {
        const accountSender = await this.accountManager.getAccountUpdate(block.fromAccount);
        const accountRecipient = await this.accountManager.getAccountUpdate(block.toAccount);
        const accountDelegator = await this.accountManager.getAccountUpdate(block.delegator);

        // Initialize sender
        accountSender.initWithBlock(block);
        accountSender.setBlockCountIncrease(1);
        accountSender.updateLastBlockHash(block.hash);
        if(accountSender.getCustomProperty('defaultDomain') == null) {
            accountSender.setCustomProperty('defaultDomain', block.domainName);
        }

        // Initialize domain account
        accountRecipient.setBlockCountIncrease(1);
        accountRecipient.initWithBlock(block);
        accountRecipient.updateLastBlockHash(block.hash);
        accountRecipient.setCustomProperty('owner', block.fromAccount);
        accountRecipient.setCustomProperty('entries', []);

        // Update delegator
        accountDelegator.setBlockCountIncrease(1);
        accountDelegator.initWithBlock(block);
        accountDelegator.updateLastBlockHash(block.hash);
    }
}

module.exports = RegisterBlockAdder;