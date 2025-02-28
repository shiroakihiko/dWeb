const IInstruction = require('../../../../interfaces/iinstruction.js');
const RefundInstructionValidator = require('./validator.js');
const RefundInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../../fees/percentagefee.js');

class RefundInstruction extends IInstruction {
    constructor(network) {
        super(network);

        // Initialize the modules
        this.validator = new RefundInstructionValidator(network);
        this.processor = new RefundInstructionProcessor(network);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

   async createInstruction(params) {
        return {
            type: 'swapRefund',
            toAccount: params.swapAccount,
            amount: params.amount
        };
    }

    async validateInstruction(validationData) {
        return await this.validator.validateInstruction(validationData);
    }

    async processInstruction(processData) {
        return await this.processor.processInstruction(processData);
    }
}

module.exports = RefundInstruction;