const BaseBlockAdder = require('../../../../../core/blockprocessors/base/baseadder');

class VoteBlockAdder extends BaseBlockAdder {
    constructor(network, validator) {
        super(network, validator);
    }

    async processAccounts(block) {
        await super.processAccounts(block);
        
        // Additional vote-specific processing
        const accountRecipient = await this.accountManager.getAccountUpdate(block.toAccount);
        const accountVoter = await this.accountManager.getAccountUpdate(block.fromAccount);
        accountRecipient.increaseField('votes', 1);
        accountRecipient.increaseField('totalVotingPower', parseFloat(accountVoter.account.votingPower));
        accountRecipient.increaseField('totalVotingScore', parseFloat(block.score) * parseFloat(accountVoter.account.votingPower));
    }
}

module.exports = VoteBlockAdder;
