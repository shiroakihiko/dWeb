const IInstruction = require('../../../interfaces/iinstruction.js');
const DelegatorInstructionValidator = require('./validator.js');
const DelegatorInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../fees/percentagefee.js');

class DelegatorInstruction extends IInstruction {
    constructor(network) {
        super(network);
        this.validator = new DelegatorInstructionValidator(network, this);
        this.processor = new DelegatorInstructionProcessor(network, this);
        
        // Set up percentage fee handler
        this.feeHandler = new PercentageFee(network);
        this.validator.setFeeHandler(this.feeHandler);
    }

   async createInstruction(params) {
        const instruction = {
            type: 'delegator',
            toAccount: params.toAccount,
            amount: params.amount,
            newDelegator: params.newDelegator
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
}

module.exports = DelegatorInstruction;