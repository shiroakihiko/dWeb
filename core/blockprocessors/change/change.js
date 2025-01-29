const BlockHelper = require('../../utils/blockhelper.js');
const Decimal = require('decimal.js');
const AccountUpdateManager = require('../../ledger/account/accountupdatemanager.js');
const ChangeBlockValidator = require('./validator.js');
const ChangeBlockAdder = require('./adder.js');
const BaseBlockProcessor = require('../base/baseprocessor.js');
const PercentageFee = require('../fees/percentagefee');

class ChangeBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);

        // Initialize the ChangeBlockValidator class
        this.validator = new ChangeBlockValidator(network);

        // Initialize the ChangeBlockAdder class
        this.ledgerAdder = new ChangeBlockAdder(network, this.validator);
        
        // Set up percentage fee handler
        this.setFeeHandler(new PercentageFee(network));
    }

    // Static factory method to create, sign, and validate a new change block
    async createNewBlock({ fromAccount, toAccount, amount, delegator, data = null, privateKey }) {
        // Populate the block with required data
        const params = {
            type: 'change',
            timestamp: Date.now(),
            fromAccount: fromAccount,
            toAccount: toAccount,
            amount: amount.toString(),  // Ensure amount is always a string
            delegator: delegator,
            data: data,
            delegatorTime: Date.now()
        };

        const block = await this.initializeBlock(params);

        // Step 3: Sign the block with the private key
        this.signBlock(block, privateKey);

        // Step 4: Generate the hash for the change block (after applying fee and reward details)
        block.hash = BlockHelper.generateHash(block);

        // Step 5: Validate the change block
        const validBlock = await this.validator.validate(block);
        if(!validBlock)
            return {'state' : 'MALFORMED_BLOCK', 'block' : null}

        return {'state' : 'ACCEPTED', 'block' : block};
    }

    // Method to sign the block with the node's private key and update the block's signature
    signBlock(block, privateKey) {
        const signature = BlockHelper.signBlock(privateKey, this);
        block.signature = signature;
        block.validatorSignatures = {};
        block.validatorSignatures[this.network.node.nodeId] = signature;
    }
}

module.exports = ChangeBlockProcessor;
