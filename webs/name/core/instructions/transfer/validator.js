const BaseInstructionValidator = require('../../../../../core/system/instruction/base/baseinstructionvalidator');
const Hasher = require('../../../../../core/utils/hasher.js');

class TransferInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['transfer'] },
            domainName: { type: 'string' }
        }, [
            'type',
            'domainName'
        ]);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;
        
        // Validate domain ownership and transfer rules
        if (instruction.toAccount === await Hasher.hashText(instruction.domainName)) {
            return { state: 'TRANSFER_TO_DOMAIN_ACCOUNT' };
        }
        
        const domain = accountManager.getAccountUpdate(await Hasher.hashText(instruction.domainName));
        if (domain.unopenedAccount()) {
            return { state: 'DOMAIN_NOT_FOUND' };
        }
        if (instruction.toAccount === action.account) {
            return { state: 'DOMAIN_RECEIVER_SAME_AS_SENDER' };
        }
        
        return { state: 'VALID' };
    }
}

module.exports = TransferInstructionValidator;