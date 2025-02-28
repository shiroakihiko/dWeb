const BaseInstructionProcessor = require('../../../../../core/system/instruction/base/baseinstructionprocessor');

class VoteEndInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async customProcessInstruction(processData) {
        const { instruction, action, accountManager } = processData;
        
        // Get accounts
        const proposalAccount = accountManager.getAccountUpdate(action.account);
        const accountProposer = accountManager.getAccountUpdate(instruction.toAccount);

        // Finish the proposal account
        proposalAccount.addAction(action);
        proposalAccount.setCustomProperty('status', 'ended');

        // Update the proposer's account
        accountProposer.setFieldIncrease('votingPower', instruction.finalScore);
        if (parseFloat(instruction.reward) > 0) {
            accountProposer.setFieldIncrease('totalRewards', instruction.reward);
        }
    }
}

module.exports = VoteEndInstructionProcessor;

