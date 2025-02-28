const Wallet = require('../../../../wallet/wallet.js');
const fs = require('fs');
const path = require('path');
const ActionHelper = require('../../../../utils/actionhelper.js');
const GenesisInstructionValidator = require('./validator.js');
const GenesisInstructionProcessor = require('./processor.js');
const Decimal = require('decimal.js');
const Hasher = require('../../../../utils/hasher.js');
const Block = require('../../../block/block.js');
const BlockHelper = require('../../../../utils/blockhelper.js');
const IInstruction = require('../../../interfaces/iinstruction.js');
const AccountUpdateManager = require('../../../../ledger/account/accountupdatemanager.js');
const Action = require('../../../action/action.js');

// The only action that does not have to pass through the consensus validator and gets directly added to a new ledger
class GenesisInstruction extends IInstruction {
    constructor(network) {
        super(network);
        this.validator = new GenesisInstructionValidator(network);
        this.processor = new GenesisInstructionProcessor(network);
    }

    createInstruction(initOptions) {
        throw new Error('Genesis by instruction not supported, call createGenesis directly instead');
    }

    async processInstruction(processData) {
        return await this.processor.processInstruction(processData);
    }

    async validateInstruction(validationData) {
        return await this.validator.validateInstruction(validationData);
    }

    async createGenesis(initOptions) {
        // Create genesis wallet for network
        this.genesisWallet = new Wallet(null);
        await this.genesisWallet.initialize();
        const genesisAccount = this.genesisWallet.getPublicKeys()[0];
        this.nodeWallet = new Wallet(path.join(process.cwd(), 'wallets', 'node.json'));
        await this.nodeWallet.initialize();
        const nodeAccount = this.nodeWallet.getPublicKeys()[0];

        // ---------- Create the genesis instruction ----------
        const instruction =  {
            type: 'genesis',
            toAccount: genesisAccount,
            amount: new Decimal(initOptions.initialSupply)
                .times(new Decimal(initOptions.decimals))
                .toFixed(0, Decimal.ROUND_DOWN),
            data: initOptions.data || null,
            /*networkValidatorWeights: {
                [nodeAccount]: 100
            },*/
            randomHash: this.generateRandomHash()
        };
        
        // ---------- Create action ----------
        const action = new Action({
            timestamp: Date.now(),
            account: genesisAccount,
            delegator: nodeAccount,
            lastSeenBlockHash: null,
            instruction: instruction,
            signatures: {}
        });
        await action.generateHash();
        
        // Sign the action with genesis wallet
        const signature = await ActionHelper.signAction(this.genesisWallet.getAccounts()[0].privateKey, action);
        action.signatures[genesisAccount] = signature;

        // ---------- Create genesis block ----------
        const genesisBlock = new Block({
            previousBlockHash: null,
            actions: [action],
            timestamp: Date.now(),
            creator: genesisAccount
        });
        await genesisBlock.generateAndSetHash();
        genesisBlock.validatorSignatures = {
            [nodeAccount]: await BlockHelper.signBlock(genesisBlock, this.nodeWallet.getAccounts()[0].privateKey),
            [genesisAccount]: await BlockHelper.signBlock(genesisBlock, this.genesisWallet.getAccounts()[0].privateKey)
        };

        // ---------- Save genesis wallet ----------
        this.genesisWallet.saveWallet(path.join(process.cwd(), 'wallets', `${initOptions.webName}_${genesisBlock.hash.substring(0, 12)}.json`));

        // ---------- Add action and block ----------
        const result = await this.addToLedger(genesisBlock);
        if (result.state !== 'ACTION_ADDED') {
            console.log(`Genesis action creation failed. ${result.error}`);
            return { state: result.state };
        }

        console.log(`Genesis action created.`);
        return { state: 'VALID', action, block: genesisBlock };
    }

    async addToLedger(block) {
        const accountManager = new AccountUpdateManager(this.network.ledger);

        // Validate action
        const validateResult = await this.validator.validateInstruction({
            instruction: block.actions[0].instruction,
            action: block.actions[0],
            accountManager
        });
        if (validateResult.state != 'VALID')
            return validateResult;

        // Process instruction (update user accounts)
        await this.processor.processInstruction({
            instruction: block.actions[0].instruction,
            action: block.actions[0],
            accountManager
        });
        await accountManager.applyUpdates();

        // Add action to ledger
        const finalAction = {...block.actions[0], blockHash: block.hash}; // Set block hash for reference (needs to be deleted for signature verification of individual actions)
        await this.network.ledger.actions.put(finalAction.hash, finalAction);

        // Log
        console.log(`Genesis network action (${block.actions[0].hash}) created for genesis account (${block.actions[0].instruction.toAccount})`);

        // Add block to ledger
        await this.network.ledger.addBlock(block);

        return { state: 'ACTION_ADDED' };
    }

    generateRandomHash() {
        return Hasher.randomHash(32);
    }
}

module.exports = GenesisInstruction;
