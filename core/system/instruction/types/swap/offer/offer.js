const IInstruction = require('../../../../interfaces/iinstruction.js');
const OfferInstructionValidator = require('./validator.js');
const OfferInstructionProcessor = require('./processor.js');
const OfferInstructionCallback = require('./callback.js');
const PercentageFee = require('../../../fees/percentagefee.js');
const Hasher = require('../../../../../utils/hasher');

class OfferInstruction extends IInstruction {
    constructor(network) {
        super(network);

        // Initialize the modules
        this.validator = new OfferInstructionValidator(network);
        this.processor = new OfferInstructionProcessor(network);
        this.callback = new OfferInstructionCallback(network);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));

    }

    async createInstruction(params) {
        const swapSecret = Hasher.randomHash(16);

        const instruction = {
            type: 'swapOffer',
            amount: params.amount,
            targetNetwork: params.targetNetwork,
            deadline: params.deadline,
            minReceived: params.minReceived,
            hashLock: await Hasher.hashText(`swapSecret(${swapSecret})`),
            swapId: Hasher.randomHash(16), // Randomly generated swap id
            linkedSwapHash: params.linkedSwapHash ? await Hasher.hashText(`counterSwap(${params.linkedSwapHash})`) : await Hasher.hashText(`swapState(${params.swapId})`),
            toAccount: params.linkedSwapHash ? 
                await Hasher.hashText(`counterSwap(${params.linkedSwapHash})`) :
                await Hasher.hashText(`swapState(${params.swapId})`)
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

module.exports = OfferInstruction;
