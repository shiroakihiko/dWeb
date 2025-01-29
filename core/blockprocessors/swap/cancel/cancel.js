const BaseBlockProcessor = require('../../base/baseprocessor');
const CancelBlockValidator = require('./validator.js');
const CancelBlockAdder = require('./adder.js');
const PercentageFee = require('../../fees/percentagefee');

class CancelBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);

        // Initialize the CancelBlockValidator class
        this.validator = new CancelBlockValidator(network);

        // Initialize the CancelBlockAdder class
        this.ledgerAdder = new CancelBlockAdder(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'swapCancel';
        block.fromAccount = params.fromAccount; // Swap account creator
        block.toAccount = params.toAccount; // Swap account
        block.amount = params.amount;
        
        return block;
    }
}

module.exports = CancelBlockProcessor;