const Ajv = require('ajv');
const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const AccountUpdateManager = require('../../../../../core/ledger/account/accountupdatemanager.js');
const Decimal = require('decimal.js');

class CommentBlockAdder {
    constructor(network, validator) {
        this.network = network;
        this.ledger = network.ledger;
        this.validator = validator;
    }

    async addBlock(block, containerHash) {
        try {
            return await this.ledger.blocks.transaction(async () => {

                const accountManager = new AccountUpdateManager(this.ledger);
                const accountSender = await accountManager.getAccountUpdate(block.fromAccount);
                const accountRecipient = await accountManager.getAccountUpdate(block.toAccount);
                const accountDelegator = await accountManager.getAccountUpdate(block.delegator);

                // Validate send block
                const validBlock = await this.validator.validate(block);
                if(validBlock.state != 'VALID')
                    return validBlock;

                // Process send block and apply updates
                const senderBalance = new Decimal(accountSender.account.balance);
                accountSender.updateBalance(senderBalance.minus(block.amount).minus(block.fee.amount).toString());
                accountSender.setBlockCountIncrease(1);
                accountSender.updateLastBlockHash(block.hash);

                accountRecipient.updateBalance(new Decimal(accountRecipient.getBalance()).add(block.amount).toString());
                accountRecipient.setBlockCountIncrease(1);
                accountRecipient.initWithBlock(block);
                accountRecipient.updateLastBlockHash(block.hash);

                accountDelegator.updateBalance(new Decimal(accountDelegator.getBalance()).add(block.fee.delegatorReward).toString());
                accountDelegator.setBlockCountIncrease(1);
                accountDelegator.initWithBlock(block);
                accountDelegator.updateLastBlockHash(block.hash);

                // Set container hash for reference (needs to deleted for signature verification)
                const finalBlock = {...block, containerHash: containerHash};
                await this.ledger.blocks.put(finalBlock.hash, JSON.stringify(finalBlock));

                await this.ledger.stats.inc('comment', 1);
                await this.ledger.stats.inc('send', block.amount);
                await this.ledger.stats.inc('fee', block.fee.amount);
                await this.ledger.stats.inc('burned', block.fee.burnAmount);
                await this.ledger.stats.inc('delegatorRewards', block.fee.delegatorReward);

                await accountManager.applyUpdates();

                return { state: 'BLOCK_ADDED' };
            });
        } catch (error) {
            return { state: 'PROCESS_FAILURE', error: error };
        }
    }
}

module.exports = CommentBlockAdder;
