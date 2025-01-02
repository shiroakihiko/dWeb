const LMDB = require('lmdb');
const LedgerStatistics = require('./stats/ledgerstats.js');
const LedgerBlockCallbacks = require('./blockcallbacks/blockcallbacks.js');

class Ledger {
    constructor(dbPath) {
        this.db = LMDB.open({ path: dbPath, mapSize: 10 * 1024 * 1024 });  // Initialize LMDB
        this.blocks = this.db.openDB({ name: 'blocks', create: true });  // Blocks DB
        this.accounts = this.db.openDB({ name: 'accounts', create: true });  // Accounts DB
        this.voteweight = this.db.openDB({ name: 'voteweight', create: true });  // Delegator vote weight
        this.blockCallbacks = new LedgerBlockCallbacks(this);
        this.stats = new LedgerStatistics(this);  // Statistics
    }

    // Fetch the last block for a given account from the blockchain
    getLastBlockForAccount(account) {
        const lastBlockHash = this.accounts.get(account) ? JSON.parse(this.accounts.get(account)).lastBlockHash : null;
        return lastBlockHash ? JSON.parse(this.blocks.get(lastBlockHash)) : null;
    }

    // Fetch the last block for a given account from the blockchain
    getAccountValidatorWeights(account) {
        const networkValidatorWeights = this.accounts.get(account) ? JSON.parse(this.accounts.get(account)).networkValidatorWeights : null;
        return networkValidatorWeights;
    }

    // Synchronous method to get the network validator weights from the transaction
    getNetworkValidatorWeights() {

        let networkValidatorWeights = {};
        let totalWeight = 0;

        // Iterate over the key-value pairs using for-of
        for (const entry of this.voteweight.getRange({})) {
            totalWeight += entry.value;
        }

        let filteredDelegators = {};

        // Iterate again to filter based on percentage
        for (const entry of this.voteweight.getRange({})) {
            let weightPercentage = (entry.value / totalWeight) * 100;

            weightPercentage = Math.floor(weightPercentage); // Truncate decimal

            // Only include delegators with at least 1% weight
            if (weightPercentage >= 1) {
                filteredDelegators[entry.key] = weightPercentage;
            }
        }

        networkValidatorWeights = filteredDelegators;

        return networkValidatorWeights;  // Return the filtered delegators
    }


    // Retrieve a specific block by ID for a specific account
    getBlock(blockHash) {
        const block = this.blocks.get(blockHash);
        return block ? JSON.parse(block) : null;
    }

    // Get the account info (including last block hash)
    getAccount(account) {
        const accountInfo = this.accounts.get(account);
        return accountInfo ? JSON.parse(accountInfo) : null;
    }

    // Get the delegator of an account
    getDelegator(account) {
        const accountInfo = this.accounts.get(account);
        return accountInfo ? JSON.parse(accountInfo).delegator : null;
    }

    // Get the last block hash (frontier) of an account
    getLastBlockHash(account) {
        const accountInfo = this.accounts.get(account);
        return accountInfo ? JSON.parse(accountInfo).lastBlockHash : null;
    }

    // Get the account info (including last block hash)
    getTransactions(account) {
        const accountInfo = this.getAccount(account); // Get account info from a map or database
        if (accountInfo == null) {
            return null;  // Return null if account doesn't exist
        }
        const lastHash = accountInfo.lastBlockHash;  // Get the last block hash
        const startBlock = accountInfo.startBlock;  // Get the start block for transactions

        const transactions = [];  // Array to store the fetched transactions

        // Starting with the last block, loop until the start block hash is found
        let currentBlock = this.getBlock(lastHash);  // Get the block by its hash

        // Continue fetching transactions until we reach the start block
        while (currentBlock) {
            // Add the block's transactions to the transactions array
            transactions.push(currentBlock);

            if(currentBlock.hash === startBlock) // last entry
                break;

            // Move to the next block (get the previous block's hash from current block)
            let previousHash = null;
            
            if (currentBlock.fromAccount == account)
                previousHash = currentBlock.previousBlockSender;
            else if (currentBlock.toAccount == account)
            {
                if(currentBlock.type == 'network')
                    previousHash = currentBlock.previousBlock;
                else
                    previousHash = currentBlock.previousBlockRecipient;
            }
            else if (currentBlock.delegator == account)
                previousHash = currentBlock.previousBlockDelegator;
            
            currentBlock = this.getBlock(previousHash);  // Fetch the next block
        }

        // Return the list of transactions found
        return transactions;
    }

    // Get the last block that matches the type
    getLastBlockByType(type, account) {
        const accountInfo = this.getAccount(account); // Get account info from a map or database
        if (accountInfo == null) {
            return null;  // Return null if account doesn't exist
        }
        const lastHash = accountInfo.lastBlockHash;  // Get the last block hash
        const startBlock = accountInfo.startBlock;  // Get the start block for transactions

        // Starting with the last block, loop until the start block hash is found
        let currentBlock = this.getBlock(lastHash);  // Get the block by its hash

        // Continue fetching transactions until we reach the start block
        while (currentBlock) {
            if(currentBlock.hash === startBlock) // last entry
                break;
            if(currentBlock.type === type) // last entry
                return currentBlock;

            // Move to the next block (get the previous block's hash from current block)
            let previousHash = null;
            if (currentBlock.fromAccount == account)
                previousHash = currentBlock.previousBlockSender;
            else if (currentBlock.toAccount == account)
                previousHash = currentBlock.previousBlockRecipient;
            else if (currentBlock.delegator == account)
                previousHash = currentBlock.previousBlockDelegator;

            currentBlock = this.getBlock(previousHash);  // Fetch the next block
        }

        return null;
    }

    // Get the number of blocks associated with a specific account
    getBlockCount(account) {
        const accountInfo = this.getAccount(account);
        if (!accountInfo) {
            return 0;  // If the account doesn't exist, there are no blocks
        }
        return accountInfo.blockCount;
    }

    // Get the total number of blocks in the entire blockchain
    getTotalBlockCount() {
        return this.blocks.getCount();
    }

    // Get the total number of accounts in the entire blockchain
    getTotalAccountCount() {
        return this.accounts.getCount();
    }

    // Get the total supply
    getSupply() {
        return this.blocks.getCount();
    }

    // Get frontiers (latest block for each account)
    getFrontiers(start, count) {
        let frontiers = [];
        for (const entry of this.accounts.getRange({})) {
            frontiers.push({ account: entry.key, lastBlockHash: JSON.parse(entry.value).lastBlockHash });
        }

        return frontiers;
    }

    // Get all blocks for account ()
    getAllBlocksForAccount(account) {
        return this.getTransactions(account);
    }

    // Get the vote weight of an account
    getVoteWeight(account) {
        return this.voteweight.get(account);
    }
}

module.exports = Ledger;
