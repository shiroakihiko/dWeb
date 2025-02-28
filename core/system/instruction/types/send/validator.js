const BaseInstructionValidator = require('../../base/baseinstructionvalidator.js');

class SendInstructionValidator extends BaseInstructionValidator {
    constructor(network, instructionProcessor) {
        super(network);
        this.instructionProcessor = instructionProcessor;
        
        // Add send-specific schema properties
        this.addInstructionProperties({
            type: { type: 'string', enum: ['send'] }
        }, ['type']);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;
        return { state: 'VALID' };
    }
}

module.exports = SendInstructionValidator;