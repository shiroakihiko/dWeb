const BaseInstructionValidator = require('../../../../../core/system/instruction/base/baseinstructionvalidator');

class EmailInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['email'] },
            content: { type: 'string' },
            members: { type: 'object' }
        }, [
            'type',
            'content',
            'members'
        ]);
    }

    // Using default validation methods from base class
}

module.exports = EmailInstructionValidator;
