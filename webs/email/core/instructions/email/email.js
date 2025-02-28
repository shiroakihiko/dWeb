const IInstruction = require('../../../../../core/system/interfaces/iinstruction');
const EmailInstructionValidator = require('./validator.js');
const EmailInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../../../../core/system/instruction/fees/percentagefee.js');

class EmailInstruction extends IInstruction {
    constructor(network) {
        super(network);

        this.validator = new EmailInstructionValidator(network);
        this.processor = new EmailInstructionProcessor(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

   async createInstruction(params) {
        const instruction = {
            type: 'email',
            toAccount: params.toAccount,
            amount: params.amount,
            content: params.content,
            members: params.members
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

module.exports = EmailInstruction;
