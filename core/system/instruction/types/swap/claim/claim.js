const IInstruction = require('../../../../interfaces/iinstruction.js');
const ClaimInstructionValidator = require('./validator.js');
const ClaimInstructionProcessor = require('./processor.js');
const PercentageFee = require('../../../fees/percentagefee.js');

class ClaimInstruction extends IInstruction {
    constructor(network) {
        super(network);

        this.validator = new ClaimInstructionValidator(network);
        this.processor = new ClaimInstructionProcessor(network);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

   async createInstruction(params) {
        const instruction = {
            type: 'swapClaim',
            toAccount: params.toAccount,
            secret: params.secret
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
module.exports = ClaimInstruction;