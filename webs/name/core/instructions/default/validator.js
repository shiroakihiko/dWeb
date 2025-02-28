const BaseInstructionValidator = require('../../../../../core/system/instruction/base/baseinstructionvalidator');
const Hasher = require('../../../../../core/utils/hasher.js');

class DefaultInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['default'] },
            domainName: { type: 'string' }
        }, [
            'type',
            'domainName'
        ]);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;
        
        // Validate domain ownership and format
        if (action.account !== instruction.toAccount) {
            return { state: 'INVALID_FROM_TO_ACCOUNT' };
        }
        
        const domain = accountManager.getAccountUpdate(await Hasher.hashText(instruction.domainName));
        if (domain.unopenedAccount()) {
            return { state: 'DOMAIN_NOT_FOUND' };
        }
        if (domain.getCustomProperty('owner') !== action.account) {
            return { state: 'DOMAIN_NOT_OWNED' };
        }
        
        if (instruction.domainName !== instruction.domainName.toLowerCase()) {
            return { state: 'DOMAIN_NOT_LOWERCASE' };
        }
        
        return { state: 'VALID' };
    }
}

module.exports = DefaultInstructionValidator;