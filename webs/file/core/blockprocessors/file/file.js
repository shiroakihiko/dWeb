const BaseBlockProcessor = require('../../../../../core/blockprocessors/base/baseprocessor');
const FileBlockValidator = require('./validator.js');
const FileBlockAdder = require('./adder.js');
const PercentageFee = require('../../../../../core/blockprocessors/fees/percentagefee');

class FileBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);
        this.validator = new FileBlockValidator(network);
        this.ledgerAdder = new FileBlockAdder(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'file';
        block.message = params.message;
        return block;
    }
}

module.exports = FileBlockProcessor;
