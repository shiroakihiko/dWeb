const IInstruction = require('../../../../../core/system/interfaces/iinstruction');
const IndexInstructionValidator = require('./validator.js');
const IndexInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../../../../core/system/instruction/fees/percentagefee.js');

class IndexInstruction extends IInstruction {
    constructor(network) {
        super(network);

        this.validator = new IndexInstructionValidator(network);
        this.processor = new IndexInstructionProcessor(network);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

   async createInstruction(params) {
        const instruction = {
            type: 'index',
            toAccount: params.toAccount,
            amount: params.amount,
            title: params.title,
            description: params.description,
            content: params.content,
            tokens: params.tokens,
            contentHash: params.contentHash
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

module.exports = IndexInstruction;
