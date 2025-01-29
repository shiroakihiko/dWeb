const BaseBlockProcessor = require('../../../../../core/blockprocessors/base/baseprocessor.js');
const RewardBlockValidator = require('./validator.js');
const RewardBlockAdder = require('./adder.js');
const crypto = require('crypto');

class RewardBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);
        this.validator = new RewardBlockValidator(network);
        this.ledgerAdder = new RewardBlockAdder(network, this.validator);
    }

    async createNewBlock(consensusBlock, sourceNetworkId, privateKey) {
        const baseReward = 1; // Max reward amount
        const rawReward = baseReward * 100000000;
        
        const params = {
            fromAccount: sourceNetworkId,
            toAccount: consensusBlock.proposerAccount,
            delegator: this.network.node.nodeId,
            amount: rawReward * parseFloat(consensusBlock.reward),
            consensusBlock: consensusBlock
        };

        const block = await this.initializeBlock(params);
        
        // Sign and validate
        this.signBlock(block, privateKey);
        
        // Special hash for reward blocks
        block.hash = crypto.createHash('sha256').update(`reward(${block.consensusBlock.proposalHash})`).digest('hex');

        const validBlock = await this.validator.validate(block);
        if(!validBlock) {
            return {'state': 'MALFORMED_BLOCK', 'block': null};
        }

        return {'state': 'VALID', 'block': block};
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'reward';
        block.consensusBlock = params.consensusBlock;
        return block;
    }

    // Override prepare method for reward blocks
    async prepareBlock(block) {
        block.timestamp = Date.now();
        block.delegatorTime = Date.now();
        
        const validBlock = await this.validator.validate(block);
        if(!validBlock) {
            return {'state': 'MALFORMED_BLOCK', 'block': null};
        }

        block.hash = crypto.createHash('sha256').update(`reward(${block.consensusBlock.proposalHash})`).digest('hex');
        block.validatorSignatures = {};
        block.validatorSignatures[this.network.node.nodeId] = BlockHelper.signBlock(this.network.node.nodePrivateKey, block);
        return {'state': 'VALID', 'block': block};
    }
}

module.exports = RewardBlockProcessor;
