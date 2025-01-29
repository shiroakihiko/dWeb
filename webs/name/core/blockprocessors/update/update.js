const BaseBlockProcessor = require('../../../../../core/blockprocessors/base/baseprocessor');
const UpdateBlockValidator = require('./validator.js');
const UpdateBlockAdder = require('./adder.js');
const PercentageFee = require('../../../../../core/blockprocessors/fees/percentagefee');

class UpdateBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);
        this.validator = new UpdateBlockValidator(network);
        this.ledgerAdder = new UpdateBlockAdder(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'update';
        block.message = params.message;
        block.domainName = params.domainName;
        block.entries = params.entries;
        return block;
    }
}

module.exports = UpdateBlockProcessor;