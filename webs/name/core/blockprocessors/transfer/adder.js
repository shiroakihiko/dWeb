const BaseBlockAdder = require('../../../../../core/blockprocessors/base/baseadder');
const Hasher = require('../../../../../core/utils/hasher.js');

class TransferBlockAdder extends BaseBlockAdder {
    constructor(network, validator) {
        super(network, validator);
    }

    async processAccounts(block) {
        const accountPresentOwner = await this.accountManager.getAccountUpdate(block.fromAccount);
        const accountNewOwner = await this.accountManager.getAccountUpdate(block.toAccount);
        const accountDomain = await this.accountManager.getAccountUpdate(Hasher.hashText(block.domainName));
        const accountDelegator = await this.accountManager.getAccountUpdate(block.delegator);

        // Update present owner
        accountPresentOwner.initWithBlock(block);
        accountPresentOwner.setBlockCountIncrease(1);
        accountPresentOwner.updateLastBlockHash(block.hash);
        if(accountPresentOwner.getCustomProperty('defaultDomain') == block.domainName) {
            accountPresentOwner.setCustomProperty('defaultDomain', await this.getNewDefaultDomain(block.fromAccount, block.domainName));
        }

        // Update new owner
        accountNewOwner.setBlockCountIncrease(1);
        accountNewOwner.initWithBlock(block);
        accountNewOwner.updateLastBlockHash(block.hash);
        if(accountNewOwner.getCustomProperty('defaultDomain') == null) {
            accountNewOwner.setCustomProperty('defaultDomain', block.domainName);
        }

        // Update domain ownership
        accountDomain.setCustomProperty('owner', block.toAccount);

        // Update delegator
        accountDelegator.setBlockCountIncrease(1);
        accountDelegator.initWithBlock(block);
        accountDelegator.updateLastBlockHash(block.hash);
    }

    async getNewDefaultDomain(owner, excludeDomain = null) {
        const history = await this.ledger.getAccountHistory(owner);
        for(let i = 0; i < history.length; i++) {
            const block = history[i];
            if(block.type == 'register' && block.domainName != excludeDomain)
                return block.domainName;
        }
        return null;
    }
}

module.exports = TransferBlockAdder;