const BaseBlockProcessor = require('../../../../../core/blockprocessors/base/baseprocessor');
const EmailBlockValidator = require('./validator.js');
const EmailBlockAdder = require('./adder.js');
const PercentageFee = require('../../../../../core/blockprocessors/fees/percentagefee');
class EmailBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);
        this.validator = new EmailBlockValidator(network);
        this.ledgerAdder = new EmailBlockAdder(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'email';
        block.content = params.content;
        block.members = params.members;
        return block;
    }
}

module.exports = EmailBlockProcessor;
