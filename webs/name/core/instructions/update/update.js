const IInstruction = require('../../../../../core/system/interfaces/iinstruction');
const UpdateInstructionValidator = require('./validator.js');
const UpdateInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../../../../core/system/instruction/fees/percentagefee.js');

class UpdateInstruction extends IInstruction {
    constructor(network) {
        super(network);
        this.validator = new UpdateInstructionValidator(network);
        this.processor = new UpdateInstructionProcessor(network);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

   async createInstruction(params) {
        const instruction = {
            type: 'update',
            toAccount: params.toAccount,
            amount: params.amount,
            message: params.message,
            domainName: params.domainName,
            entries: params.entries
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

module.exports = UpdateInstruction;