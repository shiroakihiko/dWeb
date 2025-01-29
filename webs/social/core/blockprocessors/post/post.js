const BaseBlockProcessor = require('../../../../../core/blockprocessors/base/baseprocessor');
const PostBlockValidator = require('./validator.js');
const PostBlockAdder = require('./adder.js');
const PercentageFee = require('../../../../../core/blockprocessors/fees/percentagefee');

class PostBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);
        this.validator = new PostBlockValidator(network);
        this.ledgerAdder = new PostBlockAdder(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'post';
        block.content = params.content;
        return block;
    }
}

module.exports = PostBlockProcessor;
