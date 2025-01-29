const BaseBlockProcessor = require('../../../../../core/blockprocessors/base/baseprocessor');
const RegisterBlockValidator = require('./validator.js');
const RegisterBlockAdder = require('./adder.js');
const PercentageFee = require('../../../../../core/blockprocessors/fees/percentagefee');

class RegisterBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);
        this.validator = new RegisterBlockValidator(network);
        this.ledgerAdder = new RegisterBlockAdder(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'register';
        block.message = params.message;
        block.domainName = params.domainName;
        return block;
    }
}

module.exports = RegisterBlockProcessor;