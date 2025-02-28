const IInstruction = require('../../../../../core/system/interfaces/iinstruction');
const VoteInstructionValidator = require('./validator.js');
const VoteInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../../../../core/system/instruction/fees/percentagefee.js');

class VoteInstruction extends IInstruction {
    constructor(network) {
        super(network);

        this.validator = new VoteInstructionValidator(network);
        this.processor = new VoteInstructionProcessor(network);

        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

   async createInstruction(params) {
        const instruction = {
            type: 'vote',
            toAccount: params.toAccount, // Proposal account
            amount: params.amount,
            score: params.score
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

module.exports = VoteInstruction;
