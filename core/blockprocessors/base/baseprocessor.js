const BlockHelper = require('../../utils/blockhelper.js');
const AccountUpdateManager = require('../../ledger/account/accountupdatemanager.js');
const BlockFeeCalculator = require('../shared/feecalculator.js');
const BaseFee = require('./basefee.js');

class BaseBlockProcessor {
    constructor(network) {
        this.network = network;
        this.accountManager = new AccountUpdateManager(network.ledger);
        this.feeHandler = null;
    }

    // Method to set custom fee handler
    setFeeHandler(feeHandler) {
        this.feeHandler = feeHandler;
        // Update validator schema when fee handler changes
        if (this.validator) {
            this.validator.setFeeHandler(feeHandler);
        }
    }

    // Template method for creating new blocks
    async createNewBlock(params) {
        // Initialize block with common fields
        const block = await this.initializeBlock(params);

        // Sign the block
        if (params.privateKey) {
            delete block.privateKey;   
            this.signBlock(block, params.privateKey);
        }

        // Generate hash
        block.hash = this.generateHash(block);

        // Validate the block
        const validBlock = await this.validator.validate(block);
        if (!validBlock) {
            return { 'state': 'MALFORMED_BLOCK', 'block': null };
        }

        return { 'state': 'VALID', 'block': block };
    }

    // Initialize block with common fields - can be extended by child classes
    async initializeBlock(params) {
        // Start with all params and set defaults only when needed
        let block = { ...params };
        
        // Set default values only if not provided
        block.timestamp = block.timestamp || Date.now();
        block.fromAccount = block.fromAccount || null;
        block.toAccount = block.toAccount || null;
        block.amount = block.amount ? block.amount.toString() : "0";
        block.delegator = block.delegator || null;
        block.delegatorTime = block.delegatorTime || Date.now();
        //const affectedAccounts = this.getAffectedAccounts(block);
        //block.previousBlocks = await this.chainLinker.generatePreviousBlocks(block, affectedAccounts); // Generate previous block links
        
        // Apply fee handler if one is set
        if (this.feeHandler) {
            block = this.feeHandler.applyFeeToBlock(block, params);
        }
        
        return block;
    }

    // Sign block with provided private key
    signBlock(block, privateKey) {
        const signature = BlockHelper.signBlock(privateKey, block);
        block.signature = signature;
        block.validatorSignatures = {};
        block.validatorSignatures[this.network.node.nodeId] = signature;
    }

    // Generate hash for block
    generateHash(block) {
        return BlockHelper.generateHash(block);
    }

    // Parse block from raw data
    async prepareBlock(block) {
        block.timestamp = Date.now();
        block.delegatorTime = Date.now();
        //const affectedAccounts = this.getAffectedAccounts(block);
        //block.previousBlocks = await this.chainLinker.generatePreviousBlocks(block, affectedAccounts); // Generate previous block links
        
        const validBlock = await this.validator.validate(block);
        if (!validBlock) {
            return { 'state': 'MALFORMED_BLOCK', 'block': null };
        }

        block.hash = this.generateHash(block);
        block.validatorSignatures = {};
        block.validatorSignatures[this.network.node.nodeId] = BlockHelper.signBlock(this.network.node.nodePrivateKey, block);
        return { 'state': 'VALID', 'block': block };
    }
}

module.exports = BaseBlockProcessor; 