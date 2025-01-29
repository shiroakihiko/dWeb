const BaseBlockProcessor = require('../base/baseprocessor');
const NetworkBlockValidator = require('./validator.js');
const NetworkBlockAdder = require('./adder.js');
const BlockHelper = require('../../utils/blockhelper.js');

class NetworkBlockProcessor extends BaseBlockProcessor {
    constructor(network) {
        super(network);
        this.validator = new NetworkBlockValidator(network);
        this.ledgerAdder = new NetworkBlockAdder(network, this.validator);
    }

    // Override createNewBlock since network blocks have a different creation flow
    async createNewBlock() {
        const toAccount = await this.getGenesisAccount();
        
        const params = {
            type: 'network',
            timestamp: Date.now(),
            fromAccount: this.network.node.nodeId,
            toAccount: toAccount,
            networkAccount: await this.getGenesisAccount(),
            amount: "0",
            delegator: await this.network.ledger.getDelegator(toAccount),
            data: null,
            delegatorTime: Date.now(),
            networkValidatorWeights: await this.network.ledger.getNetworkValidatorWeights(),
            networkHeight: await this.network.ledger.getTotalBlockCount()
        };

        const block = await this.initializeBlock(params);

        this.signBlock(block, this.network.node.nodePrivateKey);
        block.hash = BlockHelper.generateHash(block);

        const validBlock = await this.validator.validate(block);
        if(!validBlock)
            return {'state' : 'MALFORMED_BLOCK', 'block' : null};

        return {'state' : 'VALID', 'block' : block};
    }

    // Helper Methods
    async getGenesisAccount() {
        return (await this.network.ledger.getContainerWithBlocks(this.network.networkId)).blocks[0].toAccount;
    }
}

module.exports = NetworkBlockProcessor;
