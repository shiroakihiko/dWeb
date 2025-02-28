const IInstruction = require('../../../../../core/system/interfaces/iinstruction');
const ThumbnailInstructionValidator = require('./validator.js');
const ThumbnailInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../../../../core/system/instruction/fees/percentagefee.js');

class ThumbnailInstruction extends IInstruction {
    constructor(network) {
        super(network);
        this.validator = new ThumbnailInstructionValidator(network);
        this.processor = new ThumbnailInstructionProcessor(network);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

   async createInstruction(params) {
        const instruction = {
            type: 'thumbnail',
            toAccount: params.toAccount,
            amount: params.amount,
            thumbnailId: params.thumbnailId
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

module.exports = ThumbnailInstruction;
