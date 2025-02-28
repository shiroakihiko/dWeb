const BaseInstructionValidator = require('../../../../../core/system/instruction/base/baseinstructionvalidator');

class ChatMSGInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);

        this.addInstructionProperties({
            type: { type: 'string', enum: ['chatmsg'] },
            message: { type: 'string' }
        }, [
            'type',
            'message'
        ]);
    }
}

module.exports = ChatMSGInstructionValidator;
