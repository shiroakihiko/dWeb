const Wallet = require('../../wallet/wallet.js');
const fs = require('fs');
const path = require('path');
const BlockHelper = require('../../utils/blockhelper.js');
const GenesisBlockValidator = require('./validator.js');
const GenesisBlockAdder = require('./adder.js');
const Decimal = require('decimal.js');
const crypto = require('crypto');
const BlockContainer = require('../../containers/blockcontainer.js');
const ContainerHelper = require('../../utils/containerhelper.js');

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
        block.data = initOptions.data || null; // Optional data for the genesis block
        block.delegatorTime = Date.now();
        block.randomHash = this.generateRandomHash() // Random hash to make sure each creation (genesis block) leads to a unique hash (networkId).
    
        // Step 2: Sign the block with the newly created genesis private key
        this.signBlock(block);

        // Step 3: Generate the hash
        block.hash = BlockHelper.generateHash(block);

        // Step 4: Validate the genesis block
        const validBlock = await this.validator.validate(block);
        if(!validBlock)
        {
            console.error('Genesis block validation failed:', error.message);
            return {'state' : 'MALFORMED_BLOCK', 'block' : null}
        }

        // Step 5: Create the genesis container
        const genesisContainer = new BlockContainer();
        genesisContainer.previousContainerHash = null;
        genesisContainer.blocks = [block];
        genesisContainer.timestamp = Date.now();
        genesisContainer.creator = genesisAccount;
        genesisContainer.calculateHash(); // The network id will be pointing to the genesis container hash
        genesisContainer.validatorSignatures = {};
        genesisContainer.validatorSignatures[nodeAccount] = ContainerHelper.signContainer(genesisContainer, this.nodeWallet.getAccounts()[0].privateKey);
        genesisContainer.validatorSignatures[genesisAccount] = ContainerHelper.signContainer(genesisContainer, this.genesisWallet.getAccounts()[0].privateKey);

        // Step 6: Save the wallet under the genesis public key
        this.genesisWallet.saveWallet(path.join(process.cwd(), 'wallets', `${initOptions.webName}_${genesisContainer.hash.substring(0, 12)}.json`));

        // Step 7: Add the genesis block and container to the ledger
        const blockResult = await this.ledgerAdder.addBlock(block, genesisContainer.hash);
        const containerResult = await this.ledgerAdder.addContainer(genesisContainer.toJson());

        if(blockResult.state != 'BLOCK_ADDED')
        {
            console.log(`Genesis block creation failed. ${blockResult.error}`);
            return {'state' : blockResult.state};
        }
        if (containerResult.state != 'CONTAINER_ADDED') {
            console.log(`Genesis container creation failed. ${containerResult.error}`);
            return {'state' : containerResult.state};
        }
        
        console.log(`Genesis block created.`);
        return {'state' : 'VALID', 'block' : block, 'container' : genesisContainer};
    }

    // Sign the block with the node's private key and update the block's signature
    signBlock(block) {
        const privateKey = this.genesisWallet.getAccounts()[0].privateKey;  // Private key for signing
        const signature = BlockHelper.signBlock(privateKey, block);  // Sign the block
        block.signature = signature;
        block.validatorSignatures = {};
        block.validatorSignatures[this.nodeWallet.getPublicKeys()[0]] = signature; // Add validator signature
    }

    // Generate a random hash for networkId or other use cases
    generateRandomHash() {
        return crypto.randomBytes(32).toString('hex'); // Generate a 32-byte random hash
    }
}

module.exports = GenesisBlockProcessor;
