const BaseInstructionProcessor = require('../../base/baseinstructionprocessor.js');

class NetworkInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async processInstruction(processData) {
        const { instruction, action, accountManager } = processData;

        const networkAccount = accountManager.getAccountUpdate(instruction.toAccount);
        
        networkAccount.addAction(action);
        networkAccount.setCustomProperty('networkValidatorWeights', instruction.networkValidatorWeights);
        networkAccount.setCustomProperty('lastNetworkUpdate', action.timestamp);
        networkAccount.setCustomProperty('lastNetworkUpdateHeight', instruction.networkHeight);
    }
}

module.exports = NetworkInstructionProcessor;

