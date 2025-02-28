const BaseInstructionProcessor = require('../../../../../core/system/instruction/base/baseinstructionprocessor');

class DefaultInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async customProcessInstruction(processData) {
        const { instruction, action, accountManager } = processData;
        
        const accountRecipient = accountManager.getAccountUpdate(instruction.toAccount);
        accountRecipient.setCustomProperty('defaultDomain', instruction.domainName);
    }
}

module.exports = DefaultInstructionProcessor;