const BaseInstructionValidator = require('../../../../../core/system/instruction/base/baseinstructionvalidator');

class VoteInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['vote'] },
            score: { type: 'string' }
        }, [
            'type', 'score'
        ]);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;
        
        // Check voting rights
        const voterAccount = accountManager.getAccountUpdate(action.account);
        const votingPower = voterAccount.getCustomProperty('votingPower');
        if (voterAccount.unopenedAccount() || !votingPower || parseFloat(votingPower) <= 0) {
            return { state: 'NO_VOTING_POWER' };
        }

        // Check proposal status
        const proposalAccount = accountManager.getAccountUpdate(instruction.toAccount);
        if (proposalAccount.unopenedAccount() || proposalAccount.getCustomProperty('status') !== 'active') {
            return { state: 'INVALID_PROPOSAL' };
        }

        // Validate score range
        if (parseFloat(instruction.score) < -10 || parseFloat(instruction.score) > 10) {
            return { state: 'INVALID_SCORE' };
        }

        return { state: 'VALID' };
    }
}

module.exports = VoteInstructionValidator;
