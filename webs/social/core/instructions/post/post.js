const IInstruction = require('../../../../../core/system/interfaces/iinstruction');
const PostInstructionValidator = require('./validator.js');
const PostInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../../../../core/system/instruction/fees/percentagefee.js');

class PostInstruction extends IInstruction {
    constructor(network) {
        super(network);

        this.validator = new PostInstructionValidator(network);
        this.processor = new PostInstructionProcessor(network);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

   async createInstruction(params) {
        const instruction = {
            type: 'post',
            toAccount: params.toAccount,
            amount: params.amount,
            content: params.content
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

module.exports = PostInstruction;
