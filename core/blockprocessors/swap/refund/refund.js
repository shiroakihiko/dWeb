const BaseBlockProcessor = require('../../base/baseprocessor');
const RefundBlockValidator = require('./validator.js');
const RefundBlockAdder = require('./adder.js');
const PercentageFee = require('../../fees/percentagefee');

class RefundBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);

        // Initialize the RefundBlockValidator class
        this.validator = new RefundBlockValidator(network);

        // Initialize the RefundBlockAdder class
        this.ledgerAdder = new RefundBlockAdder(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }


    async createNewBlock(swapCreator, swapAccount, amount) {
        const params = {
            fromAccount: swapCreator,
            toAccount: swapAccount,
            amount: amount
        };

        const block = await this.initializeBlock(params);
        this.signBlock(block, this.network.node.nodePrivateKey);
        block.hash = this.generateHash(block); // Generate hash
        
        const validBlock = await this.validator.validate(block);
        if(validBlock.state != 'VALID')
            return validBlock;

        return {'state': 'VALID', 'block': block};
    }
    
    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'swapRefund';
        block.fromAccount = params.fromAccount; // Swap account creator
        block.toAccount = params.toAccount; // Swap account
        block.amount = params.amount;
        
        return block;
    }
}

module.exports = RefundBlockProcessor;