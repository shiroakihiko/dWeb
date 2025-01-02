const Ajv = require('ajv');
const BlockHelper = require('../../utils/blockhelper.js');
const Decimal = require('decimal.js');

class NetworkUpdateBlockAdder {
    constructor(network, validator) {
        this.network = network;
        this.validator = validator;
    }

    async addBlock(block) {
        const result = await this.network.ledger.accounts.transaction(async () => {
            // Validate block
            const validateResult = this.validator.validateFinal(block);
            if (validateResult.state != 'VALID')
                return validateResult;
            
            const networkAccount = block.networkAccount;

            let account = this.network.ledger.getAccount(networkAccount);
            account.networkValidatorWeights = block.networkValidatorWeights;
            account.lastBlockHash = block.hash;
            account.blockCount += 1;

            await this.network.ledger.accounts.put(networkAccount, JSON.stringify(account));
            await this.network.ledger.blocks.put(block.hash, JSON.stringify(block));

            this.network.ledger.stats.inc('networkUpdate', 1);
            return { state: 'BLOCK_ADDED' };
        });
        
        this.validator.updateNewHeight();
        
        return result;
    }
}

module.exports = NetworkUpdateBlockAdder;

