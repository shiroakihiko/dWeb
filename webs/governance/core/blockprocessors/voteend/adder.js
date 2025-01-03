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
        try {
            const result = await this.network.ledger.accounts.transaction(async () => {
                // Validate block
                const validateResult = this.validator.validateFinal(block);
                if (validateResult.state != 'VALID')
                    return validateResult;

                const proposalHash = block.proposalHash;
                const proposalBlock = this.network.ledger.getBlock(proposalHash);

                const accountManager = new AccountUpdateManager(this.network.ledger);
                const proposalAccount = accountManager.getAccountUpdate(block.fromAccount); // Proposal account ID
                const accountProposer = accountManager.getAccountUpdate(block.toAccount); // Creator of the proposal

                // Finish the proposal account
                proposalAccount.setBlockCountIncrease(1);
                proposalAccount.updateLastBlockHash(block.hash);
                proposalAccount.setCustomProperty('status', 'ended');

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
        } catch (error) {
            this.network.node.error('Error', error);
            return { state: 'PROCESS_FAILURE', error: error };
        }
    }
}

module.exports = VoteEndBlockAdder;

