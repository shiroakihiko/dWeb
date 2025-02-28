const IInstruction = require('../../../../../core/system/interfaces/iinstruction.js');
const ChatMSGInstructionValidator = require('./validator.js');
const ChatMSGInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../../../../core/system/instruction/fees/percentagefee.js');

class ChatMSGInstruction extends IInstruction {
    constructor(network) {
        super(network);
        this.validator = new ChatMSGInstructionValidator(network);
        this.processor = new ChatMSGInstructionProcessor(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

   async createInstruction(params) {
        const instruction = {
            type: 'chatmsg',
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

module.exports = ChatMSGInstruction;
