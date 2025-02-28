const IInstruction = require('../../../../../core/system/interfaces/iinstruction');
const CommentInstructionValidator = require('./validator.js');
const CommentInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../../../../core/system/instruction/fees/percentagefee.js');

class CommentInstruction extends IInstruction {
    constructor(network) {
        super(network);
        this.validator = new CommentInstructionValidator(network);
        this.processor = new CommentInstructionProcessor(network, this.validator);

        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

   async createInstruction(params) {
        const instruction = {
            type: 'comment',
            toAccount: params.toAccount,
            amount: params.amount,
            message: params.message
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

module.exports = CommentInstruction;
