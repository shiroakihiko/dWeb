const Decimal = require('decimal.js');

class Account {
    constructor(accountId) {
        this.delegator = accountId;  // Account by default is its own delegator (initialization required for voteweight)
        this.balance = 0;  // Account balance
        this.actionCount = 0;  // Number of actions mined/created by this validator
        this.history = [];  // History of actions affecting this account
        this.lastActionHash = null;  // The hash of the last action mined/created by the account
        this.startAction = null;    // The action hash an account chain started with (null == genesis)
        this.nonce = 0;  // Track the account's nonce
    }

    // Get the account info
    getAccount() {
        return {
            delegator: this.delegator,
            balance: this.balance,
            actionCount: this.actionCount,
            history: this.history,
            lastActionHash: this.lastActionHash,
            startAction: this.startAction,
            nonce: this.nonce
        };
    }
}

module.exports = Account;
