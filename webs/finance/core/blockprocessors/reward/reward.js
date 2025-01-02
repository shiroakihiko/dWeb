const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const Decimal = require('decimal.js');
const AccountUpdateManager = require('../../../../../core/ledger/account/accountupdatemanager.js');
const RewardBlockValidator = require('./validator.js');
const RewardBlockAdder = require('./adder.js');
const BlockFeeCalculator = require('../../../../../core/blockprocessors/shared/feecalculator.js');
const crypto = require('crypto');

class RewardBlockProcessor {
    constructor(network) {
        this.network = network;
        this.accountManager = new AccountUpdateManager(network.ledger);

        // Initialize the RewardBlockValidator class
        this.validator = new RewardBlockValidator(network);
        // Initialize the RewardBlockAdder class
        this.ledgerAdder = new RewardBlockAdder(network, this.validator);
        // Initialize the FeeDistributionCalculator class
        this.feeCalculator = new BlockFeeCalculator(network);
    }

    // Static factory method to create, sign, and validate a new reward block
    createNewBlock(consensusBlock, sourceNetworkId, privateKey) {
        const baseReward = 10; // Max reward amount
        // Todo: Add declining base reward off the genesis block timestamp?
        // Delegator node times already need to match up for consensus and block callbacks so we could use the genesis blocks timestamp.
        // On the other hand the inflation percentage naturally decreases as the supply increases and is already bound to economic activity (growth) anyway \_(ツ)_/
        // Good to add anyway, if other currencies fall against dWeb in the long run then a single
        // economic activity won't cause an issuance of huge amounts beyond of what it should be compensated for
        
        const fromAccount = sourceNetworkId;
        const toAccount = consensusBlock.proposerAccount;
        const delegator = this.network.node.nodeId;
        
        // Populate the block with required data
        const block = {};
        block.type = 'reward';
        block.consensusBlock = consensusBlock;
        block.timestamp = Date.now();
        block.fromAccount = fromAccount;
        block.toAccount = toAccount; // The creator of the governance reward proposal
        block.amount = baseReward * parseFloat(consensusBlock.reward); // consensusBlocks reward range is 0.0 - 1.0 
        block.delegator = delegator;
        block.previousBlockSender = this.accountManager.getAccountUpdate(fromAccount).getLastBlockHash();
        block.previousBlockRecipient = this.accountManager.getAccountUpdate(toAccount).getLastBlockHash();
        block.previousBlockDelegator = this.accountManager.getAccountUpdate(delegator).getLastBlockHash();
        block.delegatorTime = Date.now();

        // Sign the block with the private key
        this.signBlock(block, privateKey);

        // Generate the hash for the reward block
        block.hash = crypto.createHash('sha256').update(`reward(${block.consensusBlock.proposalHash})`).digest('hex');

        // Validate the reward block
        const validBlock = this.validator.validate(block);
        if(!validBlock)
            return {'state' : 'MALFORMED_BLOCK', 'block' : null};

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
            return {'state' : 'MALFORMED_BLOCK', 'block' : null};

        // Use a hash of the proposalHash instead of the blocks hash to have a distinct reward identifier
        block.hash = crypto.createHash('sha256').update(`reward(${block.consensusBlock.proposalHash})`).digest('hex');
        block.validatorSignatures = {};
        block.validatorSignatures[this.network.node.nodeId] = BlockHelper.signBlock(this.network.node.nodePrivateKey, block);
        return {'state' : 'VALID', 'block' : block};
    }

    // Static method to parse a plain object back into a Send class instance
    static parse(blockData) {
        const block = {};
        block.type = blockData.type;
        block.consensusBlock = blockData.consensusBlock;
        block.fromAccount = blockData.fromAccount;
        block.toAccount = blockData.toAccount;
        block.amount = blockData.amount;
        block.delegator = blockData.delegator;
        block.previousBlockSender = blockData.previousBlockSender;
        block.previousBlockRecipient = blockData.previousBlockRecipient;
        block.previousBlockDelegator = blockData.previousBlockDelegator;
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

module.exports = RewardBlockProcessor;
