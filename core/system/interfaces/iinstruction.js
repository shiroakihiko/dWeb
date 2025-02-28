const SharedHelper = require('../../utils/sharedhelper');
const Hasher = require('../../utils/hasher');
class IInstruction {
    constructor(network) {
        this.network = network;
        this.feeHandler = null;
    }

    // Instruction-level operations
   async createInstruction(params) { throw new Error('createInstruction must be implemented'); }
    async validateInstruction(validationData) { throw new Error('validateInstruction must be implemented'); }
    async processInstruction(processData) { throw new Error('processInstruction must be implemented'); }
    async instructionCallback(callbackData) {
        // optional callback to be used by child classes
    }

    setFeeHandler(feeHandler) {
        this.feeHandler = feeHandler;
    }
}

module.exports = IInstruction; 