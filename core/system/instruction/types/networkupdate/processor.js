const BaseInstructionProcessor = require('../../base/baseinstructionprocessor.js');

class NetworkUpdateInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async processInstruction(processData) {
        const { instruction, action, accountManager } = processData;

        const crossNetworkAction = action.instruction.crossNetworkAction;

        const networkAccount = accountManager.getAccountUpdate(crossNetworkAction.instruction.toAccount);
        
        networkAccount.addAction(action);
        networkAccount.setCustomProperty('networkValidatorWeights', crossNetworkAction.instruction.networkValidatorWeights);
        networkAccount.setCustomProperty('lastNetworkUpdate', action.timestamp);
        networkAccount.setCustomProperty('lastNetworkUpdateHeight', crossNetworkAction.instruction.networkHeight);
    }
}

module.exports = NetworkUpdateInstructionProcessor;

