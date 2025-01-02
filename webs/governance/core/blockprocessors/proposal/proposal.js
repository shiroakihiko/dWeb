const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const Decimal = require('decimal.js');
const AccountUpdateManager = require('../../../../../core/ledger/account/accountupdatemanager.js');
const ProposalBlockValidator = require('./validator.js');
const ProposalBlockAdder = require('./adder.js');
const ProposalBlockCallback = require('./callback.js');
const BlockFeeCalculator = require('../../../../../core/blockprocessors/shared/feecalculator.js');
const crypto = require('crypto');

class ProposalBlockProcessor {
    constructor(network) {
        this.network = network;
        this.accountManager = new AccountUpdateManager(network.ledger);

        // Initialize the ProposalBlockValidator class
        this.validator = new ProposalBlockValidator(network);
        // Initialize the ProposalBlockValidator class
        this.callback = new ProposalBlockCallback(network);
        // Initialize the ProposalBlockAdder class
        this.ledgerAdder = new ProposalBlockAdder(network, this.validator);
        // Initialize the FeeDistributionCalculator class
        this.feeCalculator = new BlockFeeCalculator(network);
    }

    // Static factory method to create, sign, and validate a new send block
    createNewBlock({ fromAccount, toAccount, amount, delegator, previousBlock, fee, title, description, privateKey }) {
        // Populate the block with required data
        const block = {};
        block.type = 'proposal';
        block.timestamp = Date.now();
        block.fromAccount = fromAccount;
        block.toAccount = toAccount;
        block.amount = amount.toString();  // Ensure amount is always a string
        block.delegator = delegator;
        block.title = title;
        block.description = description;
        block.previousBlockSender = this.accountManager.getAccountUpdate(fromAccount).getLastBlockHash();
        block.previousBlockRecipient = this.accountManager.getAccountUpdate(toAccount).getLastBlockHash();
        block.previousBlockDelegator = this.accountManager.getAccountUpdate(delegator).getLastBlockHash();
        block.data = data;
        block.fee = fee;
        block.delegatorTime = Date.now();

        // Step 1: Calculate fee distribution (delegator reward and burn amount)
        const { delegatorReward, burnAmount } = this.feeCalculator.calculateFeeDistribution(block);

        // Step 2: Update the send block with fee and reward details
        block.delegatorReward = delegatorReward;
        block.burnAmount = burnAmount;

        // Step 3: Sign the block with the private key
        this.signBlock(block, privateKey);

        // Step 4: Generate the hash for the send block (after applying fee and reward details)
        block.hash = BlockHelper.generateHash(block);

        // Step 5: Validate the send block
        const validBlock = this.validator.validate(block);
        if(!validBlock)
            return {'state' : 'MALFORMED_BLOCK', 'block' : null}

        return {'state' : 'VALID', 'block' : block};
    }

    // Method to sign the block with the node's private key and update the block's signature
    signBlock(block, privateKey) {
        const signature = BlockHelper.signBlock(privateKey, block);
        block.signature = signature;
        block.validatorSignatures = {};
        block.validatorSignatures[this.network.node.nodeId] = signature;
    }

    parseBlock(block)
    {
        // Add some additional data to the block
        block.timestamp = Date.now();
        block.delegatorTime = Date.now();
        
        const validBlock = this.validator.validate(block);
        if(!validBlock)
            return {'state' : 'MALFORMED_BLOCK', 'block' : null}

        block.hash = BlockHelper.generateHash(block);
        block.validatorSignatures = {};
        block.validatorSignatures[this.network.node.nodeId] = BlockHelper.signBlock(this.network.node.nodePrivateKey, block);
        return {'state' : 'VALID', 'block' : block};
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
        block.title = blockData.title;
        block.description = blockData.description;
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

module.exports = ProposalBlockProcessor;
