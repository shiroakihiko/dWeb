const BaseInstructionProcessor = require('../../../../../core/system/instruction/base/baseinstructionprocessor');

class CommentInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async customProcessInstruction(processData) {
        const { instruction, action, accountManager } = processData;
        
        return { state: 'VALID' };
    }
}

module.exports = CommentInstructionProcessor;