const BaseInstructionValidator = require('../../../base/baseinstructionvalidator.js');

class RewardActionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        // Add reward-specific schema properties
        this.addInstructionProperties({
            type: { type: 'string', enum: ['reward'] },
            crossNetworkAction: { type: 'object' },
            crossNetworkValidation: { type: 'object' }
        }, ['type', 'crossNetworkAction', 'crossNetworkValidation']);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;
        
        // Cross network validation
        console.log('crossNetworkValidation', instruction.crossNetworkAction, instruction.crossNetworkValidation);
        if(!(await this.sharedValidator.signedByNetwork(instruction.crossNetworkAction, instruction.crossNetworkValidation))) {
            return { state: 'INVALID_NETWORK_SIGNATURES' };
        }

        // From account is genesis account
        const genesisAccount = this.network.ledger.getGenesisAccount();
        if(action.account != genesisAccount) {
            return { state: 'INVALID_FROM_ACCOUNT' };
        }

        return { state: 'VALID' };
    }
}

module.exports = RewardActionValidator;
