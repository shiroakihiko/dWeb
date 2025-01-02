const Ajv = require('ajv');
const BlockHelper = require('../../utils/blockhelper.js');
const AccountUpdateManager = require('../../ledger/account/accountupdatemanager.js');
const Decimal = require('decimal.js');

class SendBlockAdder {
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
                const validateResult = this.validator.validateFinal(block);
                if (validateResult.state != 'VALID')
                    return validateResult;

                // Process send block and apply updates
                const senderBalance = new Decimal(accountSender.getBalance());
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

                await this.network.ledger.blocks.put(block.hash, JSON.stringify(block));

                this.network.ledger.stats.inc('send', block.amount);
                this.network.ledger.stats.inc('fee', block.fee);
                this.network.ledger.stats.inc('burned', block.burnAmount);
                this.network.ledger.stats.inc('delegatorRewards', block.delegatorReward);

                accountManager.applyUpdates();

                return { state: 'BLOCK_ADDED' };
            });
        } catch (error) {
            return { state: 'PROCESS_FAILURE', error: error };
        }
    }
}

module.exports = SendBlockAdder;
