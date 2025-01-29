const BaseBlockProcessor = require('../../../../../core/blockprocessors/base/baseprocessor');
const ThumbnailBlockValidator = require('./validator.js');
const ThumbnailBlockAdder = require('./adder.js');
const PercentageFee = require('../../../../../core/blockprocessors/fees/percentagefee');

class ThumbnailBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);
        this.validator = new ThumbnailBlockValidator(network);
        this.ledgerAdder = new ThumbnailBlockAdder(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'thumbnail';
        return block;
    }
}

module.exports = ThumbnailBlockProcessor;
