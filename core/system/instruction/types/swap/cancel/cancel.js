const IInstruction = require('../../../../interfaces/iinstruction.js');
const CancelInstructionValidator = require('./validator.js');
const CancelInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../../fees/percentagefee.js');

class CancelInstruction extends IInstruction {
    constructor(network) {
        super(network);

        this.validator = new CancelInstructionValidator(network);
        this.processor = new CancelInstructionProcessor(network);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

   async createInstruction(params) {
        const instruction = {
            type: 'swapCancel',
            toAccount: params.toAccount,
            amount: params.amount
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

module.exports = CancelInstruction;