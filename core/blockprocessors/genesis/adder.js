const Ajv = require('ajv');
const BlockHelper = require('../../utils/blockhelper.js');
const Account = require('../../ledger/account/account.js');
const Decimal = require('decimal.js');

class GenesisBlockAdder {
    constructor(network, validator) {
        this.network = network;
        this.validator = validator;
    }

    async addBlock(block) {
        // Validate block
        const validateResult = this.validator.validateFinal(block);
        if (validateResult.state != 'VALID')
            return validateResult;

        await this.network.ledger.blocks.put(block.hash, JSON.stringify(block));

        const account = new Account();
        account.balance = new Decimal(block.amount).toString();
        account.networkValidatorWeights = {};
        account.networkValidatorWeights[block.delegator] = 100; // Delegator gets now 100% voting power
        account.lastBlockHash = block.hash;
        account.blockCount = 1;
        account.delegator = block.delegator;
        account.startBlock = block.hash;

        await this.network.ledger.accounts.put(block.toAccount, JSON.stringify(account));
        await this.network.ledger.voteweight.put(block.delegator, block.amount);

        this.network.ledger.stats.inc('supply', block.amount);

        console.log(`Genesis network block (${block.hash}) created for genesis account (${block.toAccount})`);

        return { state: 'BLOCK_ADDED' };
    }
}

module.exports = GenesisBlockAdder;

