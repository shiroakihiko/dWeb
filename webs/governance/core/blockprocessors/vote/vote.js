const BaseBlockProcessor = require('../../../../../core/blockprocessors/base/baseprocessor');
const VoteBlockValidator = require('./validator.js');
const VoteBlockAdder = require('./adder.js');
const PercentageFee = require('../../../../../core/blockprocessors/fees/percentagefee');

class VoteBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);
        this.validator = new VoteBlockValidator(network);
        this.ledgerAdder = new VoteBlockAdder(network, this.validator);

        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'vote';
        block.score = params.score;
        return block;
    }
}

module.exports = VoteBlockProcessor;
