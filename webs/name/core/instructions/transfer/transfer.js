const IInstruction = require('../../../../../core/system/interfaces/iinstruction');
const TransferInstructionValidator = require('./validator.js');
const TransferInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../../../../core/system/instruction/fees/percentagefee.js');

class TransferInstruction extends IInstruction {
    constructor(network) {
        super(network);
        this.validator = new TransferInstructionValidator(network);
        this.processor = new TransferInstructionProcessor(network);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

   async createInstruction(params) {
        const instruction = {
            type: 'transfer',
            toAccount: params.toAccount,
            amount: params.amount,
            message: params.message,
            domainName: params.domainName
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

module.exports = TransferInstruction;