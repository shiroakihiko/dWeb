const BaseBlockAdder = require('../../../../../core/blockprocessors/base/baseadder');
const BlockHelper = require('../../../../../core/utils/blockhelper.js');

class IndexBlockAdder extends BaseBlockAdder {
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

        // Store content info in recipient account
        accountRecipient.initWithBlock(block);
        accountRecipient.setBlockCountIncrease(1);
        accountRecipient.updateLastBlockHash(block.hash);
        accountRecipient.setCustomProperty('contentInfo', {
            title: block.title,
            description: block.description,
            content: block.content,
            timestamp: block.timestamp
        });

        // Update term indices
        for(const token of block.tokens) {
            const termAccount = await this.accountManager.getAccountUpdate(
                BlockHelper.hashText('term:' + token)
            );
            
            const docs = termAccount.getCustomProperty('docs') || [];
            docs.push({
                contentId: block.toAccount,
                weight: 1 / block.tokens.length,
                timestamp: block.timestamp
            });
            
            termAccount.setCustomProperty('docs', docs);
            termAccount.setBlockCountIncrease(1);
            termAccount.initWithBlock(block);
            termAccount.updateLastBlockHash(block.hash);
        }

        // Update delegator
        accountDelegator.setBlockCountIncrease(1);
        accountDelegator.initWithBlock(block);
        accountDelegator.updateLastBlockHash(block.hash);
    }
}

module.exports = IndexBlockAdder;