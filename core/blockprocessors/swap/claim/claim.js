const BaseBlockProcessor = require('../../base/baseprocessor');
const ClaimBlockValidator = require('./validator.js');
const ClaimBlockAdder = require('./adder.js');
const PercentageFee = require('../../fees/percentagefee');

class ClaimBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);

        // Initialize the ClaimBlockValidator class
        this.validator = new ClaimBlockValidator(network);

        // Initialize the ClaimBlockAdder class
        this.ledgerAdder = new ClaimBlockAdder(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'swapClaim';
        block.fromAccount = params.fromAccount; // Swap account creator
        block.toAccount = params.toAccount; // Swap account
        block.secret = params.secret;
        
        return block;
    }
}

module.exports = ClaimBlockProcessor;