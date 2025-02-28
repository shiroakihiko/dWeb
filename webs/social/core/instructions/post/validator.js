const BaseInstructionValidator = require('../../../../../core/system/instruction/base/baseinstructionvalidator');

class PostInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['post'] },
            content: { type: 'string' },
            members: { type: 'object' }
        }, [
            'type',
            'content',
            'members'
        ]);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;
        
        return { state: 'VALID' };
    }
}

module.exports = PostInstructionValidator;
