const BaseInstructionValidator = require('../../base/baseinstructionvalidator.js');

class DelegatorInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        // Add change-specific schema properties
        this.addInstructionProperties({
            type: { type: 'string', enum: ['delegator'] },
            newDelegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' }
        }, ['type', 'newDelegator']);
    }
}

module.exports = DelegatorInstructionValidator;