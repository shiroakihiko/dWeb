const Storage = require('./storage/storage.js');
const LedgerStatistics = require('./stats/ledgerstats.js');
const LedgerBlockCallbacks = require('./blockcallbacks/blockcallbacks.js');
const Decimal = require('decimal.js');
class Ledger {
    constructor(dbPath) {
        this.storage = new Storage({
            type: process.type === 'renderer' ? 'indexeddb' : 'nedb',
            path: dbPath,
            name: 'ledger'
        });
    }

    async initialize() {
        await this.storage.initialize();
        this.blocks = await this.storage.openDB({ name: 'blocks' });
        this.accounts = await this.storage.openDB({ name: 'accounts' });
        this.voteweight = await this.storage.openDB({ name: 'voteweight' });
        this.containers = await this.storage.openDB({ name: 'containers' });
        
        this.blockCallbacks = new LedgerBlockCallbacks(this);
        await this.blockCallbacks.initialize();

        this.stats = new LedgerStatistics(this);
        await this.stats.initialize();
    }

    async getLastBlockForAccount(account) {
        const accountInfo = await this.getAccount(account);
        const lastBlockHash = accountInfo ? accountInfo.lastBlockHash : null;
        return lastBlockHash ? JSON.parse(await this.blocks.get(lastBlockHash)) : null;
    }

    async getAccountValidatorWeights(account) {
        const accountInfo = await this.getAccount(account);
        return accountInfo ? accountInfo.networkValidatorWeights : null;
    }

    async getNetworkValidatorWeights() {
        let networkValidatorWeights = {};
        let totalWeight = new Decimal(0);

        // Iterate over the key-value pairs
        const entries = await this.voteweight.getRange({});
        for (const entry of entries) {
            totalWeight = totalWeight.plus(entry.value);
        }

        let filteredDelegators = {};

        // Iterate again to filter based on percentage
        for (const entry of entries) {
            let weightPercentage = new Decimal(entry.value).div(totalWeight).times(100);
            weightPercentage = weightPercentage.toFixed(0, Decimal.ROUND_DOWN);

            if (weightPercentage >= 1) {
                filteredDelegators[entry.key] = weightPercentage;
            }
        }

        return filteredDelegators;
    }

    async getBlock(blockHash) {
        const block = await this.blocks.get(blockHash);
        return block ? JSON.parse(block) : null;
    }

    async getAccount(account) {
        const accountInfo = await this.accounts.get(account);
        return accountInfo ? JSON.parse(accountInfo) : null;
    }

    async getDelegator(account) {
        const accountInfo = await this.getAccount(account);
        return accountInfo ? accountInfo.delegator : null;
    }

    async getLastBlockHash(account) {
        const accountInfo = await this.getAccount(account);
        return accountInfo ? accountInfo.lastBlockHash : null;
    }

    async getTransactions(account) {
        const accountInfo = await this.getAccount(account);
        if (!accountInfo) return null;

        const lastHash = accountInfo.lastBlockHash;
        const startBlock = accountInfo.startBlock;
        const transactions = [];
        
        let currentBlock = await this.getBlock(lastHash);
        while (currentBlock) {
            transactions.push(currentBlock);

            if (currentBlock.hash === startBlock) break;

            const previousHash = currentBlock.previousBlocks[account];
            if (!previousHash) break;
            
            currentBlock = await this.getBlock(previousHash);
        }

        return transactions;
    }

    async getLastBlockByType(type, account) {
        const accountInfo = await this.getAccount(account);
        if (!accountInfo) return null;

        const lastHash = accountInfo.lastBlockHash;
        const startBlock = accountInfo.startBlock;
        
        let currentBlock = await this.getBlock(lastHash);
        while (currentBlock) {
            if (currentBlock.hash === startBlock) break;
            if (currentBlock.type === type) return currentBlock;

            const previousHash = currentBlock.previousBlocks[account];
            if (!previousHash) break;

            currentBlock = await this.getBlock(previousHash);
        }

        return null;
    }

    async getBlockCount(account) {
        const accountInfo = await this.getAccount(account);
        return accountInfo ? accountInfo.blockCount : 0;
    }

    async getTotalBlockCount() {
        return await this.blocks.getCount();
    }

    async getTotalAccountCount() {
        return await this.accounts.getCount();
    }

    async getTotalContainerCount() {
        return await this.containers.getCount();
    }

    async getSupply() {
        return await this.blocks.getCount();
    }

    async getFrontiers(start, count) {
        const frontiers = [];
        const entries = await this.accounts.getRange({});
        
        for (const entry of entries) {
            const accountInfo = JSON.parse(entry.value);
            frontiers.push({
                account: entry.key,
                lastBlockHash: accountInfo.lastBlockHash
            });
        }

        return frontiers;
    }

    async getAllBlocksForAccount(account) {
        return await this.getTransactions(account);
    }

    async getBlocksAfterHash(account, lastHash) {
        // First we check if the account exists
        const accountInfo = await this.getAccount(account);
        if (!accountInfo) return null;

        // Then we check if the block for the lastHash exists
        if(lastHash) {
            const block = await this.getBlock(lastHash);
            if (!block) return null;
        }

        // If the lastHash for the account is already the same as the lastBlockHash, we return an empty array
        if(accountInfo.lastBlockHash === lastHash) return [];

        // Then we give the blocks of an account iterating backwards up until the lastHash
        const blocks = [];
        
        let currentHash = accountInfo.lastBlockHash;
        while (true) {
            const currentBlock = await this.getBlock(currentHash);
            blocks.push(currentBlock);
            
            if (currentHash === accountInfo.startBlock) break;
            const previousHash = currentBlock.previousBlocks[account];
            if (!previousHash) break;
            
            currentHash = previousHash;
            if (currentHash === lastHash) break;
        }

        return blocks;
    }

    // # Vote weight methods ------------------------------------------------------------------------------------------------

    async getVoteWeight(account) {
        return await this.voteweight.get(account);
    }

    async getTotalVoteWeight() {
        return JSON.parse(await this.stats.get('supply'));
    }



    // # Container methods ------------------------------------------------------------------------------------------------

    async addContainer(container) {
        await this.containers.put(container.hash, JSON.stringify(container));
        await this.stats.set('last_container', container.hash);
    }

    async getContainer(hash) {
        const container = await this.containers.get(hash);
        return container ? JSON.parse(container) : null;
    }

    async getLastContainer() {
        const lastHash = await this.getLastContainerHash();
        if (!lastHash) return null;
        
        return await this.getContainer(lastHash);
    }

    async getLastContainerHash() {
        const lastContainerHash = await this.stats.get('last_container');
        if(!lastContainerHash)
            return null;

        return JSON.parse(lastContainerHash);
    }

    async getAccountHistory(account, count = 20, offset = 0) {
        const accountInfo = await this.getAccount(account);
        if (!accountInfo || !accountInfo.history) return [];
        
        const history = accountInfo.history;
        const start = Math.max(history.length - count - offset, 0);
        const end = Math.min(start + count, history.length);
        
        const blockHashes = history.slice(start, end);
        const blocks = [];
        
        for (const hash of blockHashes) {
            const block = await this.getBlock(hash);
            if (block) blocks.push(block);
        }
        
        return blocks;
    }

    async getBlocksInContainer(containerHash) {
        const container = await this.getContainer(containerHash);
        if (!container) return [];
        
        const blocks = [];
        for (const blockHash of container.blocks) {
            const block = await this.getBlock(blockHash);
            if(block)
            {
                delete block.containerHash;
                if (block) blocks.push(block);
            }
        }
        return blocks;
    }

    async getContainerChain(startHashEnd = null) {
        // If the startHash leads to an unknown container, we return an empty array. Node requesting is potentially ahead of ours.
        if (startHashEnd && !await this.getContainer(startHashEnd))
            return [];

        const containers = [];
        let currentHash = await this.getLastContainerHash();
        
        // Iterate backwards through the chain
        let foundStartHash = false;
        while (currentHash) {
            if (startHashEnd && currentHash === startHashEnd) {
                foundStartHash = true;
                break;
            }

            const container = await this.getContainer(currentHash);
            if (!container) break;
            
            containers.push(container);
            currentHash = container.previousContainerHash;
        }

        if (!foundStartHash)
        {
            console.log('Fork? We have the container but the startHash was not encountered in the chain');
            return [];
        }

        // reverse the array
        containers.reverse();

        return containers;
    }

    async getContainerWithBlocks(hash) {
        const container = await this.getContainer(hash);
        if (!container) return null;
        container.blocks = await this.getBlocksInContainer(hash);
        return container;
    }

    async getCurrentValidator() {
        const currentValidator = await this.stats.get('currentValidator');
        return currentValidator ? JSON.parse(currentValidator) : null;
    }

    async setCurrentValidator(nodeId) {
        await this.stats.set('currentValidator', nodeId);
    }

    async getLastContainerCreator() {
        const lastContainerHash = await this.getLastContainerHash();
        console.log(lastContainerHash);
        if(!lastContainerHash)
            return null;

        const lastContainer = await this.getContainer(lastContainerHash);
        return lastContainer ? lastContainer.creator : null;
    }

    async getRecentContainers(count) {
        const containers = [];
        let currentHash = await this.getLastContainerHash();
        
        while (containers.length < count && currentHash) {
            const container = await this.getContainer(currentHash);
            if (!container) break;
            containers.push(container);
            currentHash = container.previousContainerHash;
        }
        
        return containers;
    }
}

module.exports = Ledger;
