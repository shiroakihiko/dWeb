const BlockHelper = require('../../utils/blockhelper.js');
const Block = require('./block.js');
const Decimal = require('decimal.js');
const BlockValidator = require('./validator.js');
const BlockAdder = require('./adder.js');

class BlockProcessor {
    constructor(network) {
        this.network = network;

        this.validator = new BlockValidator(network);
        this.adder = new BlockAdder(network, this.validator);
    }

    // # Block Creation ------------------------------------------------------------------------------------------------
    
    async createBlock(blockData) {
        // Initialize block=
        const block = new Block(blockData);
        block.creator = this.network.node.nodeId;

        // Calculate block hash
        await block.generateAndSetHash();

        // Sign the block as creator
        await this.signBlock(block);

        return block.toJson();
    }

    async signBlock(block) {
        const signature = await BlockHelper.signBlock(block, this.network.node.nodePrivateKey);
        block.validatorSignatures[this.network.node.nodeId] = signature;
    }

    // # Block Validation ------------------------------------------------------------------------------------------------

    async validateBlock(block, options) {
        return await this.validator.validateBlock(block, options);
    }

    async validateNetworkConfirmation(block) {
        return await this.validator.validateNetworkConfirmation(block);
    }

    // # Block Addition ------------------------------------------------------------------------------------------------

    async addBlock(block, callback) {
        return await this.adder.addBlock(block, callback);
    }
}

module.exports = BlockProcessor; 