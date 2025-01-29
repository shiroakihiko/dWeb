const Ajv = require('ajv');
const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const Account = require('../../../../../core/ledger/account/account.js');
const AccountUpdateManager = require('../../../../../core/ledger/account/accountupdatemanager.js');
const Decimal = require('decimal.js');

class GenesisBlockAdder {
    constructor(network, validator) {
        this.network = network;
        this.validator = validator;
    }

    async addBlock(block, containerHash) {
        // Validate block
        const validateResult = await this.validator.validateFinal(block);
        if (validateResult.state != 'VALID')
            return validateResult;

        // Set container hash for reference (needs to deleted for signature verification)
        const finalBlock = {...block, containerHash: containerHash};
        await this.network.ledger.blocks.put(finalBlock.hash, JSON.stringify(finalBlock));

        const account = new Account();
        account.balance = new Decimal(block.amount).toString();
        account.networkValidatorWeights = {};
        account.networkValidatorWeights[block.delegator] = 100; // Delegator gets now 100% voting power
        account.lastBlockHash = block.hash;
        account.blockCount = 1;
        account.delegator = block.delegator;
        account.startBlock = block.hash;
        
        // Give the initial voting power to the delegator (current node)
        const accountManager = new AccountUpdateManager(this.network.ledger);
        const accountDelegator = await accountManager.getAccountUpdate(block.delegator);
        accountDelegator.initCustomProperty('votingPower', '1'); // Initial voting power on governance proposals 
        accountDelegator.initCustomProperty('totalRewards', '0');
        await accountManager.applyUpdates();

        await this.network.ledger.accounts.put(block.toAccount, JSON.stringify(account));
        await this.network.ledger.voteweight.put(block.delegator, block.amount);

        await this.network.ledger.stats.inc('genesis', 1);
        await this.network.ledger.stats.inc('supply', block.amount);

        console.log(`Genesis network block (${block.hash}) created for genesis account (${block.toAccount})`);

        return { state: 'BLOCK_ADDED' };
    }

    async addContainer(container) {
        container.blocks = container.blocks.map(block => block.hash);
        await this.network.ledger.containers.put(container.hash, JSON.stringify(container));
        await this.network.ledger.stats.set('last_container', container.hash);
        return { state: 'CONTAINER_ADDED' };
    }
}

module.exports = GenesisBlockAdder;

