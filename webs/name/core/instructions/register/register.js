const IInstruction = require('../../../../../core/system/interfaces/iinstruction');
const RegisterInstructionValidator = require('./validator.js');
const RegisterInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../../../../core/system/instruction/fees/percentagefee.js');

class RegisterInstruction extends IInstruction {
    constructor(network) {
        super(network);
        this.validator = new RegisterInstructionValidator(network);
        this.processor = new RegisterInstructionProcessor(network);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

   async createInstruction(params) {
        const instruction = {
            type: 'register',
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

module.exports = RegisterInstruction;