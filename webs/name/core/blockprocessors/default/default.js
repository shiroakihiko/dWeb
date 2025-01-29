const BaseBlockProcessor = require('../../../../../core/blockprocessors/base/baseprocessor');
const DefaultBlockValidator = require('./validator.js');
const DefaultBlockAdder = require('./adder.js');
const PercentageFee = require('../../../../../core/blockprocessors/fees/percentagefee');

class DefaultBlockProcessor extends BaseBlockProcessor {
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
        block.message = params.message;
        block.domainName = params.domainName;
        return block;
    }
}

module.exports = DefaultBlockProcessor;