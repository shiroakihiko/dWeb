const BaseBlockProcessor = require('../../../../../core/blockprocessors/base/baseprocessor');
const IndexBlockValidator = require('./validator.js');
const IndexBlockAdder = require('./adder.js');
const PercentageFee = require('../../../../../core/blockprocessors/fees/percentagefee');
class IndexBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);
        this.validator = new IndexBlockValidator(network);
        this.ledgerAdder = new IndexBlockAdder(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'index';
        block.title = params.title;
        block.description = params.description;
        block.content = params.content;
        block.tokens = params.tokens;
        block.contentHash = params.contentHash;
        return block;
    }
}

module.exports = IndexBlockProcessor;
