class BaseInstructionCallback {
    constructor(network) {
        this.network = network;
    }
    
    async instructionCallback(callbackData) {
        throw new Error('instructionCallback must be implemented');
    }
}

module.exports = BaseInstructionCallback;
