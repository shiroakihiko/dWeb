const BaseInstructionProcessor = require('../../../../../core/system/instruction/base/baseinstructionprocessor');

class EmailInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }
}

module.exports = EmailInstructionProcessor;
