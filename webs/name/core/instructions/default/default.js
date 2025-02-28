const IInstruction = require('../../../../../core/system/interfaces/iinstruction');
const DefaultInstructionValidator = require('./validator.js');
const DefaultInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../../../../core/system/instruction/fees/percentagefee.js');

class DefaultInstruction extends IInstruction {
    constructor(network) {
        super(network);
        this.validator = new DefaultInstructionValidator(network);
        this.processor = new DefaultInstructionProcessor(network);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

   async createInstruction(params) {
        const instruction = {
            type: 'default',
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

module.exports = DefaultInstruction;