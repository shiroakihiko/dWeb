const BaseBlockProcessor = require('../../../../../core/blockprocessors/base/baseprocessor');
const TransferBlockValidator = require('./validator.js');
const TransferBlockAdder = require('./adder.js');
const PercentageFee = require('../../../../../core/blockprocessors/fees/percentagefee');
class TransferBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);
        this.validator = new TransferBlockValidator(network);
        this.ledgerAdder = new TransferBlockAdder(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'transfer';
        block.message = params.message;
        block.domainName = params.domainName;
        return block;
    }
}

module.exports = TransferBlockProcessor;