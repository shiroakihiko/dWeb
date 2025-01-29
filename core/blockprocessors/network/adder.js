const BaseBlockAdder = require('../base/baseadder');

class NetworkBlockAdder extends BaseBlockAdder {
    constructor(network, validator) {
        super(network, validator);
    }

    async processAccounts(block) {
        const networkAccount = await this.accountManager.getAccountUpdate(block.networkAccount);
        
        networkAccount.networkValidatorWeights = block.networkValidatorWeights;
        networkAccount.setBlockCountIncrease(1);
        networkAccount.updateLastBlockHash(block.hash);
        
        // Update height after successful processing
        this.validator.updateNewHeight();
    }
}

module.exports = NetworkBlockAdder;

