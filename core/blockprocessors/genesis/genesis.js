const Wallet = require('../../wallet/wallet.js');
const fs = require('fs');
const path = require('path');
const BlockHelper = require('../../utils/blockhelper.js');
const GenesisBlockValidator = require('./validator.js');
const GenesisBlockAdder = require('./adder.js');
const Decimal = require('decimal.js');
const crypto = require('crypto');

// The only block that does not have to pass through the consensus validator and gets directly added to a new ledger
class GenesisBlockProcessor {
    constructor(network) {
        this.network = network;
        this.nodeWallet = new Wallet(path.join(process.cwd(), 'wallets', 'node.json')); // Initialize Wallet instance
        this.validator = new GenesisBlockValidator(network);  // Initialize the GenesisBlockValidator
        this.ledgerAdder = new GenesisBlockAdder(network, this.validator);
    }

    // Method to create, sign, and validate a new genesis block
    async createNewBlock(initOptions) {
        // We create a genesis wallet (account) for each network
        // The new wallet's public key is used as a network ID and initial block is signed with the same key (network spoofing becomes impossible this way)
        this.genesisWallet = new Wallet(null); // Initialize Wallet instance

        // Fetch the genesis and node accounts
        const genesisAccount = this.genesisWallet.getPublicKeys()[0];  // Using the first public key from the wallet
        const nodeAccount = this.nodeWallet.getPublicKeys()[0];      // Using the first public key from the node wallet

        // Populate the block with required data
        const block = {};
        block.type = 'genesis';
        block.timestamp = Date.now();
        block.fromAccount = genesisAccount;  // Genesis block has no sender
        block.toAccount = genesisAccount; // The account that receives the initial supply
        block.amount = new Decimal(initOptions.initialSupply).times(new Decimal(initOptions.decimals)).toFixed(0, Decimal.ROUND_DOWN); // Amount of coins to transfer
        block.delegator = nodeAccount; // The delegator for this block (first node is us)
        block.previousBlockSender = null; // Genesis block has no previous block sender
        block.previousBlockRecipient = null; // Genesis block has no previous block recipient
        block.previousBlockDelegator = null; // Genesis block has no previous block delegator
        block.data = initOptions.data || null; // Optional data for the genesis block
        block.fee = "0"; // No fee for genesis block
        block.delegatorTime = Date.now();
        block.delegatorReward = "0"; // No delegator reward for genesis block
        block.burnAmount = "0"; // No burn amount for genesis block
        block.randomHash = this.generateRandomHash() // Random hash to make sure each creation (genesis block) leads to a unique hash (networkId).

        // Step 2: Sign the block with the newly created genesis private key
        this.signBlock(block);

        // Step 3: Generate the hash
        block.hash = BlockHelper.generateHash(block);

        // Save the wallet under the genesis public key
        this.genesisWallet.saveWallet(path.join(process.cwd(), 'wallets', `${initOptions.webName}_${block.hash.substring(0, 12)}.json`));

        // Step 4: Validate the genesis block
        const validBlock = this.validator.validate(block);
        if(!validBlock)
        {
            console.error('Genesis block validation failed:', error.message);
            return {'state' : 'MALFORMED_BLOCK', 'block' : null}
        }

        // Step 5: Add the genesis block to the ledger
        const result = await this.ledgerAdder.addBlock(block);
        if (result.state != 'BLOCK_ADDED') {
            console.log(`Genesis block creation failed. ${result.error}`);
            return {'state' : result.state};
        } else {
            console.log(`Genesis block created.`);
            return {'state' : 'VALID', 'block' : block};
        }
    }

    // Sign the block with the node's private key and update the block's signature
    signBlock(block) {
        const privateKey = this.genesisWallet.getAccounts()[0].privateKey;  // Private key for signing
        const signature = BlockHelper.signBlock(privateKey, block);  // Sign the block
        block.signature = signature;
        block.validatorSignatures = {};
        block.validatorSignatures[this.nodeWallet.getPublicKeys()[0]] = signature; // Add validator signature
    }

    // Static method to parse a plain object back into a GenesisBlock class instance
    static parse(blockData) {
        // Populate the block with data from the blockData object
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
        block.randomHash = blockData.randomHash;
        block.signature = blockData.signature;
        block.validatorSignatures = blockData.validatorSignatures;

        return block;
    }

    // Generate a random hash for networkId or other use cases
    generateRandomHash() {
        return crypto.randomBytes(32).toString('hex'); // Generate a 32-byte random hash
    }
}

module.exports = GenesisBlockProcessor;
