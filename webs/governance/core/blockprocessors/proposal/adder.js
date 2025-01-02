const Ajv = require('ajv');
const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const AccountUpdateManager = require('../../../../../core/ledger/account/accountupdatemanager.js');
const Decimal = require('decimal.js');
const crypto = require('crypto');

class ProposalBlockAdder {
    constructor(network, validator) {
        this.network = network;
        this.ledger = network.ledger;
        this.validator = validator;
    }

    async addBlock(block) {
        try {
            return await this.ledger.blocks.transaction(async () => {

                const accountManager = new AccountUpdateManager(this.ledger);
                const accountSender = accountManager.getAccountUpdate(block.fromAccount);
                const accountRecipient = accountManager.getAccountUpdate(block.toAccount);
                const accountDelegator = accountManager.getAccountUpdate(block.delegator);
                 // Create a proposal account with the hash of the proposal block
                const accountProposalHash = crypto.createHash('sha256').update(`proposalAccount(${block.hash})`).digest('hex');
                const accountProposal = accountManager.getAccountUpdate(accountProposalHash);

                // Validate send block
                this.validator.validate(block);

                // Process send block and apply updates
                const senderBalance = new Decimal(accountSender.account.balance);
                accountSender.updateBalance(senderBalance.minus(block.amount).minus(block.fee).toString());
                accountSender.setBlockCountIncrease(1);
                accountSender.updateLastBlockHash(block.hash);
                accountSender.initCustomProperty('votingPower', '0');
                accountSender.initCustomProperty('totalRewards', '0');

                accountRecipient.updateBalance(new Decimal(accountRecipient.getBalance()).add(block.amount).toString());
                accountRecipient.setBlockCountIncrease(1);
                accountRecipient.initWithBlock(block);
                accountRecipient.updateLastBlockHash(block.hash);

                accountDelegator.updateBalance(new Decimal(accountDelegator.getBalance()).add(block.delegatorReward).toString());
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

                await this.ledger.blocks.put(block.hash, JSON.stringify(block));

                this.ledger.stats.inc('proposal', 1);
                this.ledger.stats.inc('send', block.amount);
                this.ledger.stats.inc('fee', block.fee);
                this.ledger.stats.inc('burned', block.burnAmount);
                this.ledger.stats.inc('delegatorRewards', block.delegatorReward);

                // Add a block callback to end the voting
                this.ledger.blockCallbacks.addCallback(block.hash);
                
                accountManager.applyUpdates();

                return { state: 'BLOCK_ADDED' };
            });
        } catch (error) {
            return { state: 'PROCESS_FAILURE' };
        }
    }
}

module.exports = ProposalBlockAdder;
