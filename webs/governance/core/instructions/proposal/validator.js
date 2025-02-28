const BaseInstructionValidator = require('../../../../../core/system/instruction/base/baseinstructionvalidator');

class ProposalInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['proposal'] },
            title: { type: 'string' },
            description: { type: 'string' }
        }, [
            'type',
            'title',
            'description'
        ]);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;
        
        // Check if proposal already exists
        const proposalAccount = accountManager.getAccountUpdate(action.hash);
        if (!proposalAccount.unopenedAccount()) {
            return { state: 'PROPOSAL_EXISTS' };
        }

        return { state: 'VALID' };
    }
}

module.exports = ProposalInstructionValidator;
