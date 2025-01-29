const BaseBlockProcessor = require('../../base/baseprocessor');
const OfferBlockValidator = require('./validator.js');
const OfferBlockAdder = require('./adder.js');
const OfferBlockCallback = require('./callback.js');
const PercentageFee = require('../../fees/percentagefee');

class OfferBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);

        // Initialize the OfferBlockValidator class
        this.validator = new OfferBlockValidator(network);

        // Initialize the OfferBlockAdder class
        this.ledgerAdder = new OfferBlockAdder(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));

        this.callback = new OfferBlockCallback(network);
    }

    async initializeBlock(params) {
        const swapSecret = crypto.randomBytes(16).toString('hex');

        const block = await super.initializeBlock(params);
        block.type = 'swapOffer';
        block.fromAccount = params.fromAccount;
        block.amount = params.amount;
        block.targetNetwork = params.targetNetwork;
        block.deadline = params.deadline;
        block.minReceived = params.minReceived;
        block.hashLock = crypto.createHash('sha256').update(`swapSecret(${swapSecret})`).digest('hex');
        block.swapId = crypto.randomBytes(16).toString('hex'); // Randomly generated swap id
        if (params.linkedSwapHash) {
            block.linkedSwapHash = params.linkedSwapHash;
        }
        block.toAccount = params.linkedSwapHash ? 
                crypto.createHash('sha256').update(`counterSwap(${block.linkedSwapHash})`).digest('hex') :
                crypto.createHash('sha256').update(`swapState(${block.swapId})`).digest('hex');

        return block;
    }
}

module.exports = OfferBlockProcessor;
