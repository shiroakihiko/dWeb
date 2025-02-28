const BaseInstructionProcessor = require('../../../../../core/system/instruction/base/baseinstructionprocessor');

class ChatMSGInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }
}

module.exports = ChatMSGInstructionProcessor;
