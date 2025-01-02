const BlockHelper = require('../../utils/blockhelper.js');
const Decimal = require('decimal.js');
const AccountUpdateManager = require('../../ledger/account/accountupdatemanager.js');
const ChangeBlockValidator = require('./validator.js');
const ChangeBlockAdder = require('./adder.js');
const BlockFeeCalculator = require('../shared/feecalculator.js');

class ChangeBlockProcessor {
    constructor(network) {
        this.network = network;
        this.accountManager = new AccountUpdateManager(this.network.ledger);

        // Initialize the ChangeBlockValidator class
        this.validator = new ChangeBlockValidator(network);

        // Initialize the ChangeBlockAdder class
        this.ledgerAdder = new ChangeBlockAdder(network, this.validator);

        // Initialize the FeeDistributionCalculator class
        this.feeCalculator = new BlockFeeCalculator(network);
    }

    // Static factory method to create, sign, and validate a new change block
    createNewBlock({ fromAccount, toAccount, amount, delegator, previousBlock, fee, data = null, privateKey }) {
        const block = new Change(blockchain);

        // Populate the block with required data
        block.type = 'change';
        block.timestamp = Date.now();
        block.fromAccount = fromAccount;
        block.toAccount = toAccount;
        block.amount = amount.toString();  // Ensure amount is always a string
        block.delegator = delegator;
        block.previousBlockSender = block.accountManager.getAccountUpdate(fromAccount).getLastBlockHash();
        block.previousBlockRecipient = block.accountManager.getAccountUpdate(toAccount).getLastBlockHash();
        block.previousBlockDelegator = block.accountManager.getAccountUpdate(delegator).getLastBlockHash();
        block.data = data;
        block.fee = fee;
        block.delegatorTime = Date.now();

        // Step 1: Calculate fee distribution (delegator reward and burn amount)
        const { delegatorReward, burnAmount } = this.feeCalculator.calculateFeeDistribution(block);

        // Step 2: Update the change block with fee and reward details
        block.delegatorReward = delegatorReward;
        block.burnAmount = burnAmount;

        // Step 3: Sign the block with the private key
        block.signBlock(privateKey);

        // Step 4: Generate the hash for the change block (after applying fee and reward details)
        block.hash = BlockHelper.generateHash(block);

        // Step 5: Validate the change block
        const validBlock = this.validator.validate(block);
        if(!validBlock)
            return {'state' : 'MALFORMED_BLOCK', 'block' : null}

        return {'state' : 'ACCEPTED', 'block' : block};
    }

    // Method to sign the block with the node's private key and update the block's signature
    signBlock(privateKey) {
        const signature = BlockHelper.signBlock(privateKey, this);
        block.signature = signature;
        block.validatorSignatures = {};
        block.validatorSignatures[this.network.node.nodeId] = signature;
    }

    // Static method to parse a plain object back into a Send class instance
    static parse(blockData) {
        const block = {};
        block.type = blockData.type;
        block.fromAccount = blockData.fromAccount;
        block.toAccount = blockData.toAccount;
        block.amount = blockData.amount;
        block.delegator = blockData.delegator;
        block.previousBlockSender = blockData.previousBlockSender;
        block.previousBlockRecipient = blockData.previousBlockRecipient;
        block.previousBlockDelegator = blockData.previousBlockDelegator;
        block.data = blockData.data;
        block.timestamp = blockData.timestamp;
        block.fee = blockData.fee;
        block.delegatorReward = blockData.delegatorReward;
        block.burnAmount = blockData.burnAmount;
        block.hash = blockData.hash;
        block.signature = blockData.signature;
        block.validatorSignatures = blockData.validatorSignatures;

        return block;
    }
}

module.exports = ChangeBlockProcessor;
