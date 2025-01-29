const BaseBlockProcessor = require('../base/baseprocessor');
const SendBlockValidator = require('./validator.js');
const SendBlockAdder = require('./adder.js');
const PercentageFee = require('../fees/percentagefee.js');

class SendBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);
        this.validator = new SendBlockValidator(network);
        this.ledgerAdder = new SendBlockAdder(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'send';
        block.message = params.message;
        return block;
    }
}

module.exports = SendBlockProcessor;
