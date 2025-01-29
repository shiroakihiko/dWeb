const BaseBlockAdder = require('../../../../../core/blockprocessors/base/baseadder');

class VoteEndBlockAdder extends BaseBlockAdder {
    constructor(network, validator) {
        super(network, validator);
    }

    async processAccounts(block) {
        const proposalAccount = await this.accountManager.getAccountUpdate(block.fromAccount);
        const accountProposer = await this.accountManager.getAccountUpdate(block.toAccount);

        // Finish the proposal account
        proposalAccount.setBlockCountIncrease(1);
        proposalAccount.updateLastBlockHash(block.hash);
        proposalAccount.setCustomProperty('status', 'ended');

        // Update the proposer's account
        accountProposer.increaseField('votingPower', block.finalScore);
        if(parseFloat(block.reward) > 0) {
            accountProposer.increaseField('totalRewards', block.reward);
        }
    }
}

module.exports = VoteEndBlockAdder;

