const BaseBlockProcessor = require('../../../../../core/blockprocessors/base/baseprocessor');
const CommentBlockValidator = require('./validator.js');
const CommentBlockAdder = require('./adder.js');
const PercentageFee = require('../../../../../core/blockprocessors/fees/percentagefee');
class CommentBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);
        this.validator = new CommentBlockValidator(network);
        this.ledgerAdder = new CommentBlockAdder(network, this.validator);

        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'comment';
        block.message = params.message;
        return block;
    }
}

module.exports = CommentBlockProcessor;
