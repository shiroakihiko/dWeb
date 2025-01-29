const BaseBlockAdder = require('../../../../../core/blockprocessors/base/baseadder');
const AccountUpdateManager = require('../../../../../core/ledger/account/accountupdatemanager.js');

class DefaultBlockAdder extends BaseBlockAdder {
    constructor(network, validator) {
        super(network, validator);
    }

    async addBlock(block, containerHash) {
        try {
            return await this.network.ledger.blocks.transaction(async () => {
                const accountManager = new AccountUpdateManager(this.network.ledger);
                const accountSender = await accountManager.getAccountUpdate(block.fromAccount);
                const accountRecipient = await accountManager.getAccountUpdate(block.toAccount);
                const accountDelegator = await accountManager.getAccountUpdate(block.delegator);

                // Validate block
                const validBlock = await this.validator.validate(block);
                if(validBlock.state != 'VALID')
                    return validBlock;

                // Update account properties
                accountSender.initWithBlock(block);
                accountSender.setBlockCountIncrease(1);
                accountSender.updateLastBlockHash(block.hash);
                accountSender.setCustomProperty('defaultThumbnail', block.thumbnailId);

                accountRecipient.initWithBlock(block);
                accountRecipient.setBlockCountIncrease(1);
                accountRecipient.updateLastBlockHash(block.hash);

                accountDelegator.initWithBlock(block);
                accountDelegator.setBlockCountIncrease(1);
                accountDelegator.updateLastBlockHash(block.hash);

                // Set container hash for reference (needs to deleted for signature verification)
                const finalBlock = {...block, containerHash: containerHash};
                await this.network.ledger.blocks.put(finalBlock.hash, JSON.stringify(finalBlock));

                await this.network.ledger.stats.inc('fee', block.fee.amount);
                await this.network.ledger.stats.inc('burned', block.fee.burnAmount);
                await this.network.ledger.stats.inc('delegatorRewards', block.fee.delegatorReward);

                await accountManager.applyUpdates();

                return { state: 'BLOCK_ADDED' };
            });
        } catch (error) {
            return { state: 'PROCESS_FAILURE', error: error };
        }
    }
}

module.exports = DefaultBlockAdder;