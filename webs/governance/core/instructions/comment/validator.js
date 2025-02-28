const BaseInstructionValidator = require('../../../../../core/system/instruction/base/baseinstructionvalidator');

class CommentInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['comment'] },
            comment: { type: 'string' }
        }, [
            'type',
            'comment'
        ]);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;
        
        // Check if proposal exists and is active
        const proposalAccount = accountManager.getAccountUpdate(instruction.toAccount);
        if (proposalAccount.unopenedAccount() || proposalAccount.getCustomProperty('status') !== 'active') {
            return { state: 'INVALID_PROPOSAL' };
        }

        return { state: 'VALID' };
    }
}

module.exports = CommentInstructionValidator;
