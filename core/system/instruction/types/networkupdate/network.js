const IInstruction = require('../../../interfaces/iinstruction.js');
const NetworkUpdateInstructionValidator = require('./validator.js');
const NetworkUpdateInstructionProcessor = require('./processor.js');

class NetworkUpdateInstruction extends IInstruction {
    constructor(network) {
        super(network);
        this.validator = new NetworkUpdateInstructionValidator(network);
        this.processor = new NetworkUpdateInstructionProcessor(network);
        
        // No fees on network updates, we'll use min balance instead
        this.feeHandler = null;
        this.validator.setFeeHandler(this.feeHandler);
    }

   async createInstruction(params) {
        const instruction = {
            type: 'networkUpdate',
            toAccount: params.crossNetworkAction.instruction.toAccount,
            amount: 0,
            crossNetworkAction: params.crossNetworkAction,
            crossNetworkValidation: params.crossNetworkValidation
        };

        return instruction;
    }

    async validateInstruction(validationData) {
        return await this.validator.validateInstruction(validationData);
    }

    async processInstruction(processData) {
        return await this.processor.processInstruction(processData);
    }

}

module.exports = NetworkUpdateInstruction;