const IInstruction = require('../../../../../core/system/interfaces/iinstruction');
const ProposalInstructionValidator = require('./validator.js');
const ProposalInstructionProcessor = require('./processor.js');
const ProposalInstructionCallback = require('./callback.js');
const PercentageFee = require('../../../../../core/system/instruction/fees/percentagefee.js');

class ProposalInstruction extends IInstruction {
    constructor(network) {
        super(network);

        this.validator = new ProposalInstructionValidator(network);
        this.processor = new ProposalInstructionProcessor(network);
        this.callback = new ProposalInstructionCallback(network);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    async createInstruction(params) {
        const instruction = {
            type: 'proposal',
            toAccount: params.toAccount,
            amount: params.amount,
            title: params.title,
            description: params.description
        };
        
        return instruction;
    }

    async validateInstruction(validationData) {
        return await this.validator.validateInstruction(validationData);
    }

    async processInstruction(processData) {
        return await this.processor.processInstruction(processData);
    }

    async instructionCallback(callbackData) {
        return this.callback.instructionCallback(callbackData);
    }
}

module.exports = ProposalInstruction;
