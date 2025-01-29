const BaseBlockProcessor = require('../../../../../core/blockprocessors/base/baseprocessor');
const ProposalBlockValidator = require('./validator.js');
const ProposalBlockAdder = require('./adder.js');
const ProposalBlockCallback = require('./callback.js');
const PercentageFee = require('../../../../../core/blockprocessors/fees/percentagefee');

class ProposalBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);

        // Initialize the ProposalBlockValidator class
        this.validator = new ProposalBlockValidator(network);

        // Initialize the ProposalBlockAdder class
        this.ledgerAdder = new ProposalBlockAdder(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));

        this.callback = new ProposalBlockCallback(network);
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'proposal';
        block.title = params.title;
        block.description = params.description;
        return block;
    }
}

module.exports = ProposalBlockProcessor;
