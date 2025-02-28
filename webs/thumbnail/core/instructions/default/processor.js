const BaseInstructionProcessor = require('../../../../../core/system/instruction/base/baseinstructionprocessor');
const AccountUpdateManager = require('../../../../../core/ledger/account/accountupdatemanager.js');

class DefaultInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async customProcessInstruction(processData) {
        const { instruction, action, accountManager } = processData;
        
        // Set thumbnail ID for sender
        const accountSender = accountManager.getAccountUpdate(action.account);
        accountSender.setCustomProperty('defaultThumbnail', action.hash);
    }
}

module.exports = DefaultInstructionProcessor;