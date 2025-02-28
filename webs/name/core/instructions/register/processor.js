const BaseInstructionProcessor = require('../../../../../core/system/instruction/base/baseinstructionprocessor');

class RegisterInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async customProcessInstruction(processData) {
        const { instruction, action, accountManager } = processData;
        
        const accountSender = accountManager.getAccountUpdate(action.account);
        const accountRecipient = accountManager.getAccountUpdate(instruction.toAccount);

        // Set default domain for sender if not set
        if (accountSender.getCustomProperty('defaultDomain') == null) {
            accountSender.setCustomProperty('defaultDomain', instruction.domainName);
        }

        // Initialize domain account properties
        accountRecipient.setCustomProperty('owner', action.account);
        accountRecipient.setCustomProperty('entries', []);
    }
}

module.exports = RegisterInstructionProcessor;