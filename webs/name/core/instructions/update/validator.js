const BaseInstructionValidator = require('../../../../../core/system/instruction/base/baseinstructionvalidator');
const Hasher = require('../../../../../core/utils/hasher.js');

class UpdateInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['update'] },
            domainName: { type: 'string' },
            entries: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        protocol: { type: 'string' },
                        networkId: { type: 'string' },
                        nodeId: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                        contentId: { type: 'string', nullable: true }
                    },
                    required: ['protocol', 'networkId', 'nodeId'],
                    additionalProperties: false
                }
            }
        }, [
            'type',
            'domainName',
            'entries'
        ]);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;
        
        // Validate domain ownership and format
        if (action.instruction.toAccount !== await Hasher.hashText(instruction.domainName)) {
            return { state: 'INVALID_DOMAIN' };
        }
        
        const domain = accountManager.getAccountUpdate(await Hasher.hashText(instruction.domainName));
        if (domain.unopenedAccount()) {
            return { state: 'DOMAIN_NOT_FOUND' };
        }
        if (domain.getCustomProperty('owner') !== action.account) {
            return { state: 'DOMAIN_NOT_OWNED' };
        }
        
        return { state: 'VALID' };
    }
}

module.exports = UpdateInstructionValidator;