const Storage = require('./storage/storage.js');
const LedgerStatistics = require('./stats/ledgerstats.js');
const LedgerActionCallbacks = require('./actioncallbacks/actioncallbacks.js');
const Decimal = require('decimal.js');
const CompressedContainer = require('./storage/compressedcontainer.js');

class Ledger {
    constructor(dbPath) {
        this.storage = new Storage({
            type: process.type === 'renderer' ? 'indexeddb' : 'lmdb',
            path: dbPath,
            name: 'ledger'
        });
    }

    async initialize() {
        await this.storage.initialize();
        const actionsDb = await this.storage.openDB({ name: 'actions', cache: {validated:true} });
        this.actions = new CompressedContainer(actionsDb);
        const accountsDb = await this.storage.openDB({ name: 'accounts', cache: {validated:true} });
        this.accounts = new CompressedContainer(accountsDb);
        const accountHistoryDb = await this.storage.openDB({ name: 'accountHistory', cache: {validated:true} });
        this.accountHistory = new CompressedContainer(accountHistoryDb);
        const voteweightDb = await this.storage.openDB({ name: 'voteweight' });
        this.voteweight = new CompressedContainer(voteweightDb);
        const blocksDb = await this.storage.openDB({ name: 'blocks' });
        this.blocks = new CompressedContainer(blocksDb);
        const crossactionsDb = await this.storage.openDB({ name: 'crossactions' });
        this.crossactions = new CompressedContainer(crossactionsDb);
        
        this.actionCallbacks = new LedgerActionCallbacks(this);
        await this.actionCallbacks.initialize();

        this.stats = new LedgerStatistics(this);
        await this.stats.initialize();
    }

    Stop() {
        this.storage.close();
    }

    // # Cross network action methods ------------------------------------------------------------------------------------------------

    async setCrossAction(hash, action) {
        await this.crossactions.put(hash, action);
    }

    getCrossAction(hash) {
        const action = this.crossactions.get(hash);
        return action ? action : null;
    }

    getCrossActionCount() {
        return this.crossactions.getCount();
    }

    // # Action methods ------------------------------------------------------------------------------------------------

    getLastActionForAccount(account) {
        const accountInfo = this.getAccount(account);
        const lastActionHash = accountInfo ? accountInfo.lastActionHash : null;
        return lastActionHash ? this.actions.get(lastActionHash) : null;
    }

    getAccountValidatorWeights(account) {
        const accountInfo = this.getAccount(account);
        return accountInfo ? accountInfo.networkValidatorWeights : null;
    }

    getNetworkValidatorWeights() {
        let totalWeight = new Decimal(0);
        // First pass: calculate total weight (only positive values)
        const entries = this.voteweight.getRange({});
        
        for (const entry of entries) {
            const weight = new Decimal(entry.value);
            // Only add positive weights to total
            if (weight.gt(0)) {
                totalWeight = totalWeight.plus(weight);
            }
        }

        let filteredDelegators = {};
        // Second pass: calculate percentages
        for (const entry of entries) {
            const weight = new Decimal(entry.value);
            // Only calculate percentage for positive weights
            if (weight.gt(0)) {
                const weightPercentage = weight.div(totalWeight).times(100);
                
                // Only include if percentage is >= 1%
                if (weightPercentage.gte(1)) {
                    filteredDelegators[entry.key] = weightPercentage.toFixed(2);
                }
            }
        }

        return filteredDelegators;
    }

    getAction(actionHash) {
        const action = this.actions.get(actionHash);
        return action ? action : null;
    }

    getAccount(account) {
        const accountInfo = this.accounts.get(account);
        const history = this.accountHistory.get(account);
        if(history)
            accountInfo.history = history;

        return accountInfo ? accountInfo : null;
    }

    async setAccount(accountId, accountInfo) {
        // We seperate the history from the accounts state for faster lookups
        const finalAccountInfo = {...accountInfo};
        delete finalAccountInfo.history;
        
        if(accountInfo.history)
            await this.accountHistory.put(accountId, accountInfo.history);
        await this.accounts.put(accountId, finalAccountInfo);
    }

    getDelegator(account) {
        const accountInfo = this.getAccount(account);
        return accountInfo ? accountInfo.delegator : null;
    }

    getActionCount(account) {
        const accountInfo = this.getAccount(account);
        return accountInfo ? accountInfo.actionCount : 0;
    }

    getTotalActionCount() {
        return this.actions.getCount();
    }

    getTotalAccountCount() {
        return this.accounts.getCount();
    }

    getTotalBlockCount() {
        return this.blocks.getCount();
    }
    getAccountHistory(account, count = 20, offset = 0) {
        const history = this.accountHistory.get(account);
        if (!history) return [];
        
        const start = Math.max(history.length - count - offset, 0);
        const end = Math.min(start + count, history.length);
        
        const actionHashes = history.slice(start, end);
        const actions = [];
        
        for (const hash of actionHashes) {
            const action = this.getAction(hash);
            if (action) actions.push(action);
        }
        
        return actions;
    }

    getAccountNonce(account) {
        const accountInfo = this.getAccount(account);
        return accountInfo ? accountInfo.nonce : 0;
    }

    getLastActionByType(type, account) {
        const accountInfo = this.getAccount(account);
        if (!accountInfo || !accountInfo.history) return null;
        
        const history = accountInfo.history;
        
        for (const hash of history.reverse()) {
            const action = this.getAction(hash);
            if (action && action.instruction.type === type) {
                return action;
            }
        }

        return null;
    }

    getFrontiers(start, count) {
        const frontiers = [];
        const entries = this.accounts.getRange({});
        
        for (const entry of entries) {
            const accountInfo = entry.value;
            frontiers.push({
                account: entry.key,
                lastActionHash: accountInfo.lastActionHash
            });
        }

        return frontiers;
    }

    getAllActionsForAccount(account) {
        return this.getTransactions(account);
    }

    getActionsAfterHash(account, lastHash) {
        // First we check if the account exists
        const accountInfo = this.getAccount(account);
        if (!accountInfo) return null;

        // Then we check if the action for the lastHash exists
        if(lastHash) {
            const action = this.getAction(lastHash);
            if (!action) return null;
        }

        // If the lastHash for the account is already the same as the lastActionHash, we return an empty array
        if(accountInfo.lastActionHash === lastHash) return [];

        // Then we give the actions of an account iterating backwards up until the lastHash
        const actions = [];
        
        let currentHash = accountInfo.lastActionHash;
        while (true) {
            const currentAction = this.getAction(currentHash);
            actions.push(currentAction);
            
            if (currentHash === accountInfo.startAction) break;
            const previousHash = currentAction.previousActions[account];
            if (!previousHash) break;
            
            currentHash = previousHash;
            if (currentHash === lastHash) break;
        }

        return actions;
    }

    // # Vote weight methods ------------------------------------------------------------------------------------------------

    getVoteWeight(account) {
        return this.voteweight.get(account);
    }

    getTotalVoteWeight() {
        const supply = this.stats.get('SUPPLY');
        return supply ? supply : null;
    }

    async addVoteWeight(account, amount) {
        const currentWeight = this.getVoteWeight(account) || 0;
        await this.voteweight.put(account, new Decimal(currentWeight).plus(amount).toFixed());
    }

    async removeVoteWeight(account, amount) {
        const currentWeight = this.getVoteWeight(account) || 0;
        await this.voteweight.put(account, new Decimal(currentWeight).minus(amount).toFixed());
    }



    // # Block methods ------------------------------------------------------------------------------------------------

    async addBlock(block) {
        const blockJson = {...block};
        blockJson.actions = blockJson.actions.map(action => action.hash);
        await this.blocks.put(block.hash, blockJson);
        await this.stats.set('LAST_BLOCK', block.hash);
        if(this.getGenesisBlockHash() == null)
            await this.setGenesisBlockHash(block.hash);
    }

    getBlock(hash) {
        const block = this.blocks.get(hash);
        return block ? block : null;
    }

    getLastBlock() {
        const lastHash = this.getLastBlockHash();
        if (!lastHash) return null;
        
        return this.getBlock(lastHash);
    }

    getLastBlockHash() {
        const lastBlockHash = this.stats.get('LAST_BLOCK');
        if(!lastBlockHash)
            return null;

        return lastBlockHash;
    }

    getBlockDistance(blockHash, maxDistance = 180) {
        const lastBlockHash = this.getLastBlockHash();
        if (!lastBlockHash) return null;

        const blockExists = this.getBlock(blockHash);
        if (!blockExists) return null;

        let distance = 0;
        let currentHash = lastBlockHash;

        while (currentHash && distance < maxDistance) {
            if (currentHash === blockHash) {
                return distance;
            }

            const block = this.getBlock(currentHash);
            if (!block) break;

            currentHash = block.previousBlockHash;
            distance++;
        }

        // If we've reached maxDistance or exceeded the chain without finding the block
        return null;
    }

    getActionsInBlock(blockHash) {
        const block = this.getBlock(blockHash);
        if (!block) return [];
        
        const actions = [];
        for (const actionHash of block.actions) {
            const action = this.getAction(actionHash);
            if(action)
            {
                delete action.blockHash;
                if (action) actions.push(action);
            }
        }
        return actions;
    }

    getBlockChain(startHashEnd = null) {
        // If the startHash leads to an unknown block, we return an empty array. Node requesting is potentially ahead of ours.
        if (startHashEnd && !this.getBlock(startHashEnd))
            return [];

        const blocks = [];
        let currentHash = this.getLastBlockHash();
        
        // Iterate backwards through the chain
        let foundStartHash = false;
        while (currentHash) {
            if (startHashEnd && currentHash === startHashEnd) {
                foundStartHash = true;
                break;
            }

            const block = this.getBlock(currentHash);
            if (!block) break;
            
            blocks.push(block);
            currentHash = block.previousBlockHash;
        }

        if (!foundStartHash)
        {
            console.log('Fork? We have the block but the startHash was not encountered in the chain');
            return [];
        }

        // reverse the array
        blocks.reverse();

        return blocks;
    }

    getBlockWithActions(hash) {
        const block = this.getBlock(hash);
        if (!block) return null;
        block.actions = this.getActionsInBlock(hash);
        return block;
    }

    getCurrentValidator() {
        const currentValidator = this.stats.get('currentValidator');
        return currentValidator ? currentValidator : null;
    }

    async setCurrentValidator(nodeId) {
        await this.stats.set('currentValidator', nodeId);
    }

    getLastBlockCreator() {
        const lastBlockHash = this.getLastBlockHash();
        if(!lastBlockHash)
            return null;

        const lastBlock = this.getBlock(lastBlockHash);
        return lastBlock ? lastBlock.creator : null;
    }

    getRecentBlocks(count) {
        const blocks = [];
        let currentHash = this.getLastBlockHash();
        
        while (blocks.length < count && currentHash) {
            const block = this.getBlock(currentHash);
            if (!block) break;
            blocks.push(block);
            currentHash = block.previousBlockHash;
        }
        
        return blocks;
    }

    // # Genesis helper ------------------------------------------------------------------------------------------------

    async setGenesisBlockHash(blockHash) {
        await this.stats.set('GENESIS_BLOCKHASH', blockHash);
    }
    getGenesisBlockHash() {
        const genesisBlockHash = this.stats.get('GENESIS_BLOCKHASH');
        return genesisBlockHash ? genesisBlockHash : null;
    }

    getGenesisAccount() {
        const genesisBlockHash = this.getGenesisBlockHash();
        if(!genesisBlockHash)
            return null;

        const genesisBlock = this.getBlockWithActions(genesisBlockHash);
        if(!genesisBlock)
            return null;

        return genesisBlock.actions[0].instruction.toAccount;
    }


    // # Stats methods ------------------------------------------------------------------------------------------------

    getSupply() {
        const supply = this.stats.get('SUPPLY');
        if (!supply) return new Decimal(0);
        
        return new Decimal(supply);
    }
    
    async increaseSupply(amount) {
        const supply = this.getSupply();
        await this.stats.set('SUPPLY', supply.plus(amount).toFixed());
    }
    
}

module.exports = Ledger;
