const BaseBlockProcessor = require('../../../../../core/blockprocessors/base/baseprocessor');
const VoteEndBlockValidator = require('./validator.js');
const VoteEndBlockAdder = require('./adder.js');
const crypto = require('crypto');

class VoteEndBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);
        this.validator = new VoteEndBlockValidator(network);
        this.ledgerAdder = new VoteEndBlockAdder(network, this.validator);
    }

    async createNewBlock(proposalHash) {
        const proposalAccount = crypto.createHash('sha256').update(`proposalAccount(${proposalHash})`).digest('hex');
        const proposerAccount = (await this.network.ledger.getBlock(proposalHash)).fromAccount;
        
        const params = {
            fromAccount: proposalAccount,
            toAccount: proposerAccount,
            delegator: proposalAccount,
            networkAccount: await this.getGenesisAccount(),
            sourceNetworkId: this.network.networkId,
            proposalHash: proposalHash,
            proposerAccount: proposerAccount,
            finalScore: await this.validator.getFinalScore(proposalAccount),
            reward: await this.validator.calculateReward(proposalAccount)
        };

        const block = await this.initializeBlock(params);
        this.signBlock(block, this.network.node.nodePrivateKey);
        block.hash = this.generateHash(block); // Generate hash
        
        const validBlock = await this.validator.validate(block);
        if(validBlock.state != 'VALID')
            return validBlock;

        return {'state': 'VALID', 'block': block};
    }

    async initializeBlock(params) {
        const block = await super.initializeBlock(params);
        block.type = 'voteend';
        block.networkAccount = params.networkAccount;
        block.sourceNetworkId = params.sourceNetworkId;
        block.proposalHash = params.proposalHash;
        block.proposerAccount = params.proposerAccount;
        block.finalScore = params.finalScore;
        block.reward = params.reward;
        return block;
    }

    async getGenesisAccount() {
        return (await this.network.ledger.getContainerWithBlocks(this.network.networkId)).blocks[0].toAccount;
    }
}

module.exports = VoteEndBlockProcessor;
