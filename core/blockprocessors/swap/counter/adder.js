const Ajv = require('ajv');
const BlockHelper = require('../../../utils/blockhelper.js');
const AccountUpdateManager = require('../../../ledger/account/accountupdatemanager.js');
const Decimal = require('decimal.js');
const crypto = require('crypto');

class OfferBlockAdder {
    constructor(network, validator) {
        this.network = network;
        this.validator = validator;
    }

    async addBlock(block, containerHash) {
        try {
            return await this.network.ledger.blocks.transaction(async () => {
                const accountManager = new AccountUpdateManager(this.network.ledger);
                const accountSender = await accountManager.getAccountUpdate(block.fromAccount);
                const accountDelegator = await accountManager.getAccountUpdate(block.delegator);
                
                // Create unique swap state account based on whether it's linked
                const accountSwap = await accountManager.getAccountUpdate(block.toAccount);

                // Validate swap block
                const validBlock = await this.validator.validate(block);
                if(validBlock.state != 'VALID')
                    return validBlock;

                // Lock the balance being swapped
                const senderBalance = new Decimal(accountSender.account.balance);
                accountSender.updateBalance(senderBalance.minus(block.amount).minus(block.fee.amount).toString());
                accountSender.setBlockCountIncrease(1);
                accountSender.updateLastBlockHash(block.hash);
                
                // Initialize swap state account
                accountSwap.setBlockCountIncrease(1);
                accountSwap.initWithBlock(block);
                accountSwap.updateLastBlockHash(block.hash);
                accountSwap.updateBalance(new Decimal(accountSwap.getBalance()).plus(block.amount).toString());
                // Initialize swap state
                accountSwap.initCustomProperty('status', 'pending');
                accountSwap.initCustomProperty('amount', block.amount);
                accountSwap.initCustomProperty('sender', block.fromAccount);
                accountSwap.initCustomProperty('recipient', block.toAccount);
                accountSwap.initCustomProperty('deadline', block.deadline.toString());
                accountSwap.initCustomProperty('minReceived', block.minReceived);
                accountSwap.initCustomProperty('swapHash', block.hash);
                accountSwap.initCustomProperty('hashLock', block.hashLock);

                if (block.linkedSwapHash) {
                    accountSwap.initCustomProperty('linkedSwapHash', block.linkedSwapHash);
                }

                // Handle delegator rewards
                if (block.delegator) {
                    accountDelegator.updateBalance(new Decimal(accountDelegator.getBalance())
                        .plus(block.fee.delegatorReward).toString());
                    accountDelegator.setBlockCountIncrease(1);
                    accountDelegator.updateLastBlockHash(block.hash);
                }

                // Save block
                const finalBlock = {...block, containerHash: containerHash};
                await this.network.ledger.blocks.put(finalBlock.hash, JSON.stringify(finalBlock));

                // Update statistics
                await this.network.ledger.stats.inc('swap', 1);
                await this.network.ledger.stats.inc('fee', block.fee.amount);
                await this.network.ledger.stats.inc('burned', block.fee.burnAmount);
                await this.network.ledger.stats.inc('delegatorRewards', block.fee.delegatorReward);

                // Add callback to monitor swap completion/timeout
                await this.network.ledger.blockCallbacks.addCallback(block.hash);
                
                await accountManager.applyUpdates();

                // Notify target network
                this.network.node.sendTargetNetwork(block.targetNetwork, {
                    type: 'swapRequest',
                    swapHash: block.hash,
                    linkedSwapHash: block.linkedSwapHash,
                    block: block
                });

                return { state: 'BLOCK_ADDED' };
            });
        } catch (error) {
            this.network.node.error(`Failed to add swap block ${block.hash}:`, error);
            return { state: 'PROCESS_FAILURE', error: error };
        }
    }
}

module.exports = OfferBlockAdder;