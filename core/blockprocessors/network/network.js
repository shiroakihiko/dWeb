const BlockHelper = require('../../utils/blockhelper.js');
const NetworkBlockValidator = require('./validator.js');
const NetworkBlockAdder = require('./adder.js');
const BlockFeeCalculator = require('../shared/feecalculator.js');
const AccountUpdateManager = require('../../ledger/account/accountupdatemanager.js');

class NetworkBlockProcessor {
    constructor(network) {
        this.network = network;
        this.validator = new NetworkBlockValidator(network);  // Initialize the validator
        this.ledgerAdder = new NetworkBlockAdder(network, this.validator);  // Initialize the ledger adder
        // Initialize the FeeDistributionCalculator class
        this.feeCalculator = new BlockFeeCalculator(network);
        this.accountManager = new AccountUpdateManager(network.ledger);
    }

    // Method to create, sign, and validate a new network update block
    createNewBlock() {
        const toAccount = this.getGenesisAccount();

        // Populate the block with required data
        const block = {};
        block.type = 'network';
        block.timestamp = Date.now();
        block.fromAccount = this.network.node.nodeId;  // Node ID as the fromAccount
        block.toAccount = toAccount;
        block.networkAccount = this.getGenesisAccount();
        block.amount = 0;  // Amount is 0 for network update
        block.delegator = this.getDelegator(toAccount);
        block.previousBlock = this.accountManager.getAccountUpdate(toAccount).getLastBlockHash();
        block.data = null;  // Optional data, default to null
        block.fee = 0;     // Fee is 0 for network update
        block.delegatorTime = Date.now();
        block.networkValidatorWeights = this.network.ledger.getNetworkValidatorWeights();
        block.networkHeight = this.getNetworkHeight();  // Current network height

        // Step 1: Sign the block with the node's private key
        this.signBlock(block);

        // Step 2: Generate the hash for the network update block
        block.hash = BlockHelper.generateHash(block);

        // Step 3: Validate the network update block
        const validBlock = this.validator.validate(block);
        if(!validBlock)
            return {'state' : 'MALFORMED_BLOCK', 'block' : null};

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

    // Fetch the current network height (total block count)
    getNetworkHeight() {
        return this.network.ledger.getTotalBlockCount();
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
        block.amount = blockData.amount;
        block.delegator = blockData.delegator;
        block.previousBlock = blockData.previousBlock;
        block.data = blockData.data;
        block.timestamp = blockData.timestamp;
        block.fee = blockData.fee;
        block.networkValidatorWeights = blockData.networkValidatorWeights;
        block.networkHeight = blockData.networkHeight;
        block.hash = blockData.hash;
        block.signature = blockData.signature;
        block.validatorSignatures = blockData.validatorSignatures;

        return block;
    }
}

module.exports = NetworkBlockProcessor;
