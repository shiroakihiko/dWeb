const BaseInstructionProcessor = require('../../../../../core/system/instruction/base/baseinstructionprocessor');

class UpdateInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async customProcessInstruction(processData) {
        const { instruction, action, accountManager } = processData;
        
        // Update domain entries
        const domainAccount = accountManager.getAccountUpdate(instruction.toAccount);
        domainAccount.setCustomProperty('entries', instruction.entries);
    }
}

module.exports = UpdateInstructionProcessor;