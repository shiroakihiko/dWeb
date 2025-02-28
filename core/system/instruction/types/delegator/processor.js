const BaseInstructionProcessor = require('../../base/baseinstructionprocessor.js');

class DelegatorInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    customProcessInstruction(processData) {
        const { instruction, action, accountManager } = processData;

        // Get accounts involved in delegation change
        const userAccount = accountManager.getAccountUpdate(action.account);
        // Update user account with new instruction
        userAccount.addAction(action);
        // Update user's delegator
        userAccount.setDelegator(action.instruction.newDelegator);
    }
}

module.exports = DelegatorInstructionProcessor;