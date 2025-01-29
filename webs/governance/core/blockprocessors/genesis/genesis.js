const BaseBlockProcessor = require('../../../../../core/blockprocessors/base/baseprocessor');
const GenesisBlockValidator = require('./validator.js');
const GenesisBlockAdder = require('./adder.js');
const Wallet = require('../../../../../core/wallet/wallet.js');
const path = require('path');
const crypto = require('crypto');
const Decimal = require('decimal.js');
const BlockContainer = require('../../../../../core/containers/blockcontainer.js');
const ContainerHelper = require('../../../../../core/utils/containerhelper.js');

class GenesisBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);
        this.nodeWallet = new Wallet(path.join(process.cwd(), 'wallets', 'node.json'));
        this.validator = new GenesisBlockValidator(network);
        this.ledgerAdder = new GenesisBlockAdder(network, this.validator);
    }

    async createNewBlock(initOptions) {
        // Create genesis wallet for network
        this.genesisWallet = new Wallet(null);
        const genesisAccount = this.genesisWallet.getPublicKeys()[0];
        const nodeAccount = this.nodeWallet.getPublicKeys()[0];

        const params = {
            fromAccount: genesisAccount,
            toAccount: genesisAccount,
            amount: new Decimal(initOptions.initialSupply).times(new Decimal(initOptions.decimals)).toFixed(0, Decimal.ROUND_DOWN),
            delegator: nodeAccount,
            data: initOptions.data || null,
            randomHash: this.generateRandomHash()
        };

        const block = await this.initializeBlock(params);

        // Step 2: Sign the block with the newly created genesis private key
        this.signBlock(block, this.genesisWallet.getPrivateKey());

        // Step 3: Generate the hash
        block.hash = BlockHelper.generateHash(block);

        // Step 4: Create the genesis container
        const genesisContainer = new BlockContainer();
        genesisContainer.previousContainerHash = null;
        genesisContainer.blocks = [block];
        genesisContainer.timestamp = Date.now();
        genesisContainer.creator = genesisAccount;
        genesisContainer.calculateHash(); // The network id will be pointing to the genesis container hash
        genesisContainer.validatorSignatures = {};
        genesisContainer.validatorSignatures[nodeAccount] = ContainerHelper.signContainer(genesisContainer, this.nodeWallet.getAccounts()[0].privateKey);
        genesisContainer.validatorSignatures[genesisAccount] = ContainerHelper.signContainer(genesisContainer, this.genesisWallet.getAccounts()[0].privateKey);

        // Step 5: Save wallet under genesis public key
        this.genesisWallet.saveWallet(path.join(process.cwd(), 'wallets', `${initOptions.webName}_${genesisContainer.hash.substring(0, 12)}.json`));

        // Step 6: Add the genesis block and container to the ledger
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

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'genesis';
        block.randomHash = params.randomHash;
        return block;
    }

    generateHash(block) {
        // For genesis blocks, we want the hash to be deterministic based on the randomHash
        return crypto.createHash('sha256').update(block.randomHash).digest('hex');
    }

    generateRandomHash() {
        return crypto.randomBytes(32).toString('hex');
    }
}

module.exports = GenesisBlockProcessor;
