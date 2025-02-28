const IInstruction = require('../../../../interfaces/iinstruction.js');
const CounterInstructionValidator = require('./validator.js');
const CounterInstructionProcessor = require('./processor.js');
const CounterInstructionCallback = require('./callback.js');
const PercentageFee = require('../../../fees/percentagefee.js');
const Hasher = require('../../../../../utils/hasher');

class CounterInstruction extends IInstruction {
    constructor(network) {
        super(network);

        // Initialize the CounterInstructionValidator class
        this.validator = new CounterInstructionValidator(network);

        // Initialize the CounterInstructionProcessor class
        this.processor = new CounterInstructionProcessor(network);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));

        this.callback = new CounterInstructionCallback(network);
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

module.exports = CounterInstruction;
