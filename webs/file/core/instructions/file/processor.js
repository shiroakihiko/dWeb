const BaseInstructionProcessor = require('../../../../../core/system/instruction/base/baseinstructionprocessor');

class FileInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async customProcessInstruction(processData) {
        const { instruction, action, accountManager } = processData;
        
        return { state: 'VALID' };
    }
}

module.exports = FileInstructionProcessor;
