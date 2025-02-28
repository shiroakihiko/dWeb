const BaseInstructionProcessor = require('../../../../../core/system/instruction/base/baseinstructionprocessor');

class ThumbnailInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }
    
    async customProcessInstruction(processData) {
        const { instruction, action, accountManager } = processData;

        // Set action hash as thumbnail ID for sender
        const accountSender = accountManager.getAccountUpdate(action.account);
        accountSender.setCustomProperty('defaultThumbnail', action.hash);
    }
}

module.exports = ThumbnailInstructionProcessor;
