const IInstruction = require('../../../interfaces/iinstruction.js');
const SendInstructionValidator = require('./validator.js');
const SendInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../fees/percentagefee.js');

class SendInstruction extends IInstruction {
    constructor(network) {
        super(network);
        this.validator = new SendInstructionValidator(network);
        this.processor = new SendInstructionProcessor(network);
        
        // Set up percentage fee handler
        this.feeHandler = new PercentageFee(network);
        this.validator.setFeeHandler(this.feeHandler);
    }

   async createInstruction(params) {
        const instruction = {
            type: 'send',
            toAccount: params.toAccount,
            amount: params.amount,
            message: params.message
        };
        this.feeHandler.applyFeeToInstruction(instruction);

        return instruction;
    }

    async validateInstruction(validationData) {
        return await this.validator.validateInstruction(validationData);
    }

    async processInstruction(processData) {
        return await this.processor.processInstruction(processData);
    }

    async instructionCallback(callbackData) {
        // optional callback to be used by child classes
    }
}

module.exports = SendInstruction;