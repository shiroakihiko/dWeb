const BaseBlockAdder = require('../base/baseadder');

class SendBlockAdder extends BaseBlockAdder {
    constructor(network, validator) {
        super(network, validator);
    }
    
    // In reward this should increase the balance of the recipient
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
}

module.exports = SendBlockAdder;
