const Decimal = require('decimal.js');

class Account {
    constructor() {
        this.delegator = null;  // Account validator
        this.balance = "0";  // Account balance
        this.blockCount = "0";  // Number of blocks mined/created by this validator
        this.lastBlockHash = null;  // The hash of the last block mined/created by the account
        this.startBlock = null;    // The block hash an account chain started with (null == genesis)
    }

    // Increment block count (for every block created by this account/validator)
    incrementBlockCount() {
        this.blockCount++;
    }

    // Set the last block hash
    setLastBlockHash(blockHash) {
        this.lastBlockHash = blockHash;
    }

    // Get the account info
    getAccount() {
        return {
            delegator: this.delegator,
            balance: this.balance,
            blockCount: this.blockCount,
            lastBlockHash: this.lastBlockHash,
            startBlock: this.startBlock
        };
    }
}

module.exports = Account;
