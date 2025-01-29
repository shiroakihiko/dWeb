const BaseBlockProcessor = require('../../../../../core/blockprocessors/base/baseprocessor');
const ChatMSGBlockValidator = require('./validator.js');
const ChatMSGBlockAdder = require('./adder.js');
const PercentageFee = require('../../../../../core/blockprocessors/fees/percentagefee');

class ChatMSGBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);
        this.validator = new ChatMSGBlockValidator(network);
        this.ledgerAdder = new ChatMSGBlockAdder(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'chatmsg';
        block.message = params.message;
        return block;
    }
}

module.exports = ChatMSGBlockProcessor;
