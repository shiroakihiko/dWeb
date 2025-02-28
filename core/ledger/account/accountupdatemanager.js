const AccountUpdate = require('./accountupdate.js');
const Account = require('./account');  // Assuming Account class is in the same directory

class AccountUpdateManager {
    constructor(ledger) {
        this.ledger = ledger;
        this.updates = new Map();
        this.dryRun = false;
    }

    setDryRun(dryRun) {
        this.dryRun = dryRun;
    }

    isDryRun() {
        return this.dryRun;
    }

    // Get an account reference, and return it if we already have it, otherwise fetch and store it
    getAccountUpdate(accountId) {
        if (!this.updates.has(accountId)) {
            let account = this.ledger.getAccount(accountId);
            // If no account exists (i.e. new account), create a default account instance
            if (!account) {
                account = new Account();
            }
            const voteWeight = this.ledger.getVoteWeight(accountId);
            this.updates.set(accountId, new AccountUpdate(accountId, account, voteWeight, this.dryRun))
        }
        return this.updates.get(accountId);
    }

    // Apply all updates for all accounts at the end of the transaction
    async applyUpdates() {
        // First validate all updates
        for (const update of this.updates.values()) {
            const validationResult = update.validate();
            if (!validationResult.valid) {
                throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
            }
        }
        
        if (this.dryRun) return true;
        
        // Commit all account updates
        for (const update of this.updates.values()) {
            update.commit();
        }

        // Apply all vote weight changes
        await this.ledger.voteweight.transaction(async () => {
            for (const [accountId, accountUpdate] of this.updates) {
                // Apply vote weight changes
                for (const change of accountUpdate.getVoteWeightChanges()) {
                    // amount is already negative for removals, positive for additions
                    this.ledger.addVoteWeight(change.delegator, change.amount);
                }
            }
        });
        // Apply all account updates
        await this.ledger.accounts.transaction(async () => {
            for (const [accountId, accountUpdate] of this.updates) {
                // Save account if it has updates
                if(accountUpdate.hasUpdates()) {
                    this.ledger.setAccount(accountId, accountUpdate.account);
                }
            }
        });
    }

    applyValidation() {
        for (const update of this.updates.values()) {
            const validationResult = update.validate();
            if (!validationResult.valid) {
                return false;
            }
        }

        return true;
    }
}

module.exports = AccountUpdateManager;
