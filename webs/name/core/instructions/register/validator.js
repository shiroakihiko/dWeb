const BaseInstructionValidator = require('../../../../../core/system/instruction/base/baseinstructionvalidator');
const Hasher = require('../../../../../core/utils/hasher.js');

class RegisterInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['register'] },
            domainName: { type: 'string' }
        }, [
            'type',
            'domainName'
        ]);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;
        
        // Validate domain format and availability
        if (instruction.toAccount !== await Hasher.hashText(instruction.domainName)) {
            return { state: 'INVALID_DOMAIN' };
        }
        
        const domain = accountManager.getAccountUpdate(await Hasher.hashText(instruction.domainName));
        if (!domain.unopenedAccount()) {
            return { state: 'DOMAIN_TAKEN' };
        }

        if (instruction.domainName !== instruction.domainName.toLowerCase()) {
            return { state: 'DOMAIN_NOT_LOWERCASE' };
        }
        
        return { state: 'VALID' };
    }
}

module.exports = RegisterInstructionValidator;