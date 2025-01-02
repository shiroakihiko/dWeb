const Ajv = require('ajv');
const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const AccountUpdateManager = require('../../../../../core/ledger/account/accountupdatemanager.js');
const Decimal = require('decimal.js');

class VoteEndBlockAdder {
    constructor(network, validator) {
        this.network = network;
        this.validator = validator;
    }

    async addBlock(block) {
        const result = await this.network.ledger.accounts.transaction(async () => {
            // Validate block
            const validateResult = this.validator.validateFinal(block);
            if (validateResult.state != 'VALID')
                return validateResult;
            
            const proposalHash = block.proposalHash;
            const proposalBlock = this.network.ledger.getBlock(proposalHash);

            const accountManager = new AccountUpdateManager(this.network.ledger);
            const accountProposal = accountManager.getAccountUpdate(block.toAccount); // Proposal account ID
            const accountProposer = accountManager.getAccountUpdate(proposalBlock.fromAccount); // Creator of the proposal
            
            // Finish the proposal account
            accountProposal.setBlockCountIncrease(1);
            accountProposal.updateLastBlockHash(block.hash);
            accountProposal.setCustomProperty('status', 'ended');
            
            // Update the propopers account
            accountProposer.increaseField('votingPower', block.finalScore);
            if(parseFloat(block.reward) > 0)
                accountProposer.increaseField('totalRewards', block.reward);
            
            // Add the vote end block
            await this.network.ledger.blocks.put(block.hash, JSON.stringify(block));
            this.network.ledger.stats.inc('voteend', 1);
            
            // Apply the account updates
            accountManager.applyUpdates();
            
            return { state: 'BLOCK_ADDED' };
        });
        
        return result;
    }
}

module.exports = VoteEndBlockAdder;

