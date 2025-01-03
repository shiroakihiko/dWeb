const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const VoteEndBlockValidator = require('./validator.js');
const VoteEndBlockAdder = require('./adder.js');
const BlockFeeCalculator = require('../../../../../core/blockprocessors/shared/feecalculator.js');
const AccountUpdateManager = require('../../../../../core/ledger/account/accountupdatemanager.js');
const crypto = require('crypto');

class VoteEndBlockProcessor {
    constructor(network) {
        this.network = network;
        this.validator = new VoteEndBlockValidator(network);  // Initialize the validator
        this.ledgerAdder = new VoteEndBlockAdder(network, this.validator);  // Initialize the ledger adder
        // Initialize the FeeDistributionCalculator class
        this.feeCalculator = new BlockFeeCalculator(network);
        this.accountManager = new AccountUpdateManager(network.ledger);
    }

    // Method to create, sign, and validate a new vote end block
    createNewBlock(proposalHash) {
        const proposalAccount = crypto.createHash('sha256').update(`proposalAccount(${proposalHash})`).digest('hex');
        const proposerAccount = this.network.ledger.getBlock(proposalHash).fromAccount;
        
        const fromAccount = proposalAccount; // proposal account
        const toAccount = proposerAccount; // the proposer's account
        const delegator = proposalAccount;
              
        // Populate the block with required data
        const block = {};
        block.type = 'voteend';
        block.timestamp = Date.now();
        block.fromAccount = fromAccount;
        block.networkAccount = this.getGenesisAccount();
        block.toAccount = toAccount;
        block.sourceNetworkId = this.network.networkId;
        block.amount = 0;  // Amount is 0 for network update
        block.delegator = delegator;
        block.previousBlockSender = this.accountManager.getAccountUpdate(fromAccount).getLastBlockHash();
        block.previousBlockRecipient = this.accountManager.getAccountUpdate(toAccount).getLastBlockHash();
        block.previousBlockDelegator = this.accountManager.getAccountUpdate(delegator).getLastBlockHash();
        block.data = null;  // Optional data, default to null
        block.proposalHash = proposalHash;
        block.proposerAccount = proposerAccount;
        block.fee = 0;     // Fee is 0 for network update
        block.delegatorTime = Date.now();
        block.finalScore = this.validator.getFinalScore(fromAccount); 
        block.reward = this.validator.calculateReward(fromAccount); 

        // Step 1: Sign the block with the node's private key
        this.signBlock(block);

        // Step 2: Generate the hash for the network update block
        block.hash = BlockHelper.generateHash(block);

        // Step 3: Validate the network update block
        const validBlock = this.validator.validate(block);
        if(validBlock.state != 'VALID')
            return validBlock;

        return {'state' : 'VALID', 'block' : block};
    }

    // Helper Methods

    // Fetch the genesis account from the ledger
    getGenesisAccount() {
        return this.network.ledger.getBlock(this.network.networkId).toAccount;
    }

    // Fetch the delegator for the genesis account
    getDelegator(genesisAccount) {
        return this.network.ledger.getDelegator(genesisAccount);
    }

    // Sign the block with the node's private key and update the block's signature
    signBlock(block) {
        const signature = BlockHelper.signBlock(this.network.node.nodePrivateKey, block);
        block.signature = signature;
        block.validatorSignatures = {};
        block.validatorSignatures[this.network.node.nodeId] = signature;
    }

    // Static method to parse a plain object back into a NetworkUpdateBlock class instance
    static parse(blockData) {
        // Populate the block with data from the blockData object
        const block = {};
        block.type = blockData.type;
        block.fromAccount = blockData.fromAccount;
        block.toAccount = blockData.toAccount;
        block.sourceNetworkId = blockData.sourceNetworkId;
        block.amount = blockData.amount;
        block.delegator = blockData.delegator;
        block.previousBlockSender = blockData.previousBlockSender;
        block.previousBlockRecipient = blockData.previousBlockRecipient;
        block.previousBlockDelegator = blockData.previousBlockDelegator;
        block.data = blockData.data;
        block.proposalHash = blockData.proposalHash;
        block.proposerAccount = blockData.proposerAccount;
        block.timestamp = blockData.timestamp;
        block.fee = blockData.fee;
        block.networkHeight = blockData.networkHeight;
        block.hash = blockData.hash;
        block.signature = blockData.signature;
        block.validatorSignatures = blockData.validatorSignatures;

        return block;
    }
}

module.exports = VoteEndBlockProcessor;
