const BaseInstructionProcessor = require('../../../../../core/system/instruction/base/baseinstructionprocessor');

class VoteInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async customProcessInstruction(processData) {
        const { instruction, action, accountManager } = processData;
        
        // Additional vote-specific processing
        const proposalAccount = accountManager.getAccountUpdate(instruction.toAccount);
        const voterAccount = accountManager.getAccountUpdate(action.account);
        const votingPower = voterAccount.getCustomProperty('votingPower');
        proposalAccount.setFieldIncrease('votes', 1);
        proposalAccount.setFieldIncrease('totalVotingPower', parseFloat(votingPower));
        proposalAccount.setFieldIncrease('totalVotingScore', parseFloat(action.instruction.score) * parseFloat(votingPower));
    }
}

module.exports = VoteInstructionProcessor;
