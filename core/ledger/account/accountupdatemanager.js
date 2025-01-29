const AccountUpdate = require('./accountupdate.js');
const Account = require('./account');  // Assuming Account class is in the same directory

class AccountUpdateManager {
    constructor(ledger) {
        this.ledger = ledger;
        this.accountUpdates = new Map(); // This will store references to accounts
    }

    // Get an account reference, and return it if we already have it, otherwise fetch and store it
    async getAccountUpdate(accountId) {
        if (!this.accountUpdates.has(accountId)) {
            let account = await this.ledger.getAccount(accountId); // Get the current account from storage
            if (!account) {
                account = new Account(); // Create a new account if none exists
            }
            this.accountUpdates.set(accountId, new AccountUpdate(account)); // Store the AccountUpdate instance
        }
        return this.accountUpdates.get(accountId); // Return the stored AccountUpdate instance
    }

    // Apply all updates for all accounts at the end of the transaction
    async applyUpdates() {
        for (const [accountId, accountUpdate] of this.accountUpdates) {
            accountUpdate.apply(); // Apply updates to the account
            await this.ledger.accounts.put(accountId, JSON.stringify(accountUpdate.account)); // Save the updated account
        }
    }
}

module.exports = AccountUpdateManager;
