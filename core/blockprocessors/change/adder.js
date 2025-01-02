const Ajv = require('ajv');
const BlockHelper = require('../../utils/blockhelper.js');
const Decimal = require('decimal.js');

class ChangeBlockAdder {
    constructor(network, validator) {
        this.network = network;
        this.validator = validator;
    }

    async addBlock(block) {
        try {
            return await this.network.ledger.blocks.transaction(async () => {
                // Validate block
                const validateResult = this.validator.validateFinal(block);
                if (validateResult.state != 'VALID')
                    return validateResult;

                let accountInfo = this.network.ledger.getAccount(block.fromAccount);
                let delegatorAccount = this.network.ledger.getAccount(block.delegator);

                let voteWeight = this.network.ledger.voteweight.get(accountInfo.delegator);
                if (voteWeight) {
                    this.network.ledger.voteweight.put(accountInfo.delegator, voteWeight - block.amount);
                    this.network.ledger.voteweight.put(block.delegator, voteWeight + block.amount);
                }

                accountInfo.delegator = block.delegator;
                await this.network.ledger.accounts.put(block.fromAccount, JSON.stringify(accountInfo));
                await this.network.ledger.blocks.put(block.hash, JSON.stringify(block));
                this.network.ledger.stats.inc('change', 1);

                return { state: 'BLOCK_ADDED' };
            });
        } catch (error) {
            return { state: 'PROCESS_FAILURE', error: error };
        }
    }
}

module.exports = ChangeBlockAdder;
