const Ajv = require('ajv');
const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const AccountUpdateManager = require('../../../../../core/ledger/account/accountupdatemanager.js');
const Decimal = require('decimal.js');
const crypto = require('crypto');

class ProposalBlockAdder {
    constructor(network, validator) {
        this.network = network;
        this.validator = validator;
    }

    async addBlock(block, containerHash) {
        try {
            return await this.network.ledger.blocks.transaction(async () => {
                const accountManager = new AccountUpdateManager(this.network.ledger);
                const accountSender = await accountManager.getAccountUpdate(block.fromAccount);
                const accountRecipient = await accountManager.getAccountUpdate(block.toAccount);
                const accountDelegator = await accountManager.getAccountUpdate(block.delegator);
                 // Create a proposal account with the hash of the proposal block
                const accountProposalHash = crypto.createHash('sha256').update(`proposalAccount(${block.hash})`).digest('hex');
                const accountProposal = await accountManager.getAccountUpdate(accountProposalHash);

                // Validate send block
                const validBlock = await this.validator.validate(block);
                if(validBlock.state != 'VALID')
                    return validBlock;

                // Process send block and apply updates
                const senderBalance = new Decimal(accountSender.account.balance);
                accountSender.updateBalance(senderBalance.minus(block.amount).minus(block.fee.amount).toString());
                accountSender.setBlockCountIncrease(1);
                accountSender.updateLastBlockHash(block.hash);
                accountSender.initCustomProperty('votingPower', '0');
                accountSender.initCustomProperty('totalRewards', '0');

                accountRecipient.updateBalance(new Decimal(accountRecipient.getBalance()).add(block.amount).toString());
                accountRecipient.setBlockCountIncrease(1);
                accountRecipient.initWithBlock(block);
                accountRecipient.updateLastBlockHash(block.hash);

                accountDelegator.updateBalance(new Decimal(accountDelegator.getBalance()).add(block.fee.delegatorReward).toString());
                accountDelegator.setBlockCountIncrease(1);
                accountDelegator.initWithBlock(block);
                accountDelegator.updateLastBlockHash(block.hash);
                accountDelegator.initCustomProperty('votingPower', '0');
                accountDelegator.initCustomProperty('totalRewards', '0');

                // New proposal account that's the target for comment block, vote blocks, and holds the present state
                accountProposal.setBlockCountIncrease(1);
                accountProposal.initWithBlock(block);
                accountProposal.updateLastBlockHash(block.hash);
                accountProposal.initCustomProperty('status', 'active');
                accountProposal.initCustomProperty('votes', '0');
                accountProposal.initCustomProperty('totalVotingScore', '0');
                accountProposal.initCustomProperty('totalVotingPower', '0');

                // Set container hash for reference (needs to deleted for signature verification)
                const finalBlock = {...block, containerHash: containerHash};
                await this.network.ledger.blocks.put(finalBlock.hash, JSON.stringify(finalBlock));

                await this.network.ledger.stats.inc('proposal', 1);
                await this.network.ledger.stats.inc('send', block.amount);
                await this.network.ledger.stats.inc('fee', block.fee.amount);
                await this.network.ledger.stats.inc('burned', block.fee.burnAmount);
                await this.network.ledger.stats.inc('delegatorRewards', block.fee.delegatorReward);

                // Add a block callback to end the voting
                await this.network.ledger.blockCallbacks.addCallback(block.hash);
                
                await accountManager.applyUpdates();

                return { state: 'BLOCK_ADDED' };
            });
        } catch (error) {
            this.network.node.error(`Failed to add proposal block ${block.hash}:`, error);
            return { state: 'PROCESS_FAILURE', error: error };
        }
    }
}

module.exports = ProposalBlockAdder;
