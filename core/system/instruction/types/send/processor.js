const BaseInstructionProcessor = require('../../base/baseinstructionprocessor.js');

class SendInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }
}

module.exports = SendInstructionProcessor;