const BaseBlockProcessor = require('../../../../../core/blockprocessors/base/baseprocessor');
const DefaultBlockValidator = require('./validator.js');
const DefaultBlockAdder = require('./adder.js');
const PercentageFee = require('../../../../../core/blockprocessors/fees/percentagefee');
class DefaultThumbnailBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);
        this.validator = new DefaultBlockValidator(network);
        this.ledgerAdder = new DefaultBlockAdder(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'default';
        block.thumbnailId = params.thumbnailId;
        return block;
    }
}

module.exports = DefaultThumbnailBlockProcessor; 