const Decimal = require('decimal.js');

// Methods may be called multiple times (e.g. in case fromAccount is the same as the toAccount)
// this class is used to prevent issues of inproper changes through multiple calls by
// using the same reference and overwriting values instead of adding to them.
class AccountUpdate {

    constructor(accountId, account, voteWeight) {
        this.accountId = accountId; 
        this.account = account;
        this.updates = {}; // Store the updates to apply to the account
        this.fieldIncreases = {}; // Track field increases
        this.actionCountIncrease = 0;
        this.newActionHashes = new Set(); // Track new actions affecting this account
        this.voteWeight = voteWeight || 0;
        this.voteWeightUpdate = voteWeight || 0;
        this.voteWeightChanges = []; // Track vote weight changes as {delegator, amount} pairs
    }

    // NEW: Helper method for updating the balance
    updateBalance(delta) {
        if (!this.updates.balance) {
            this.updates.balance = this.account.balance || 0;
        }
        this.updates.balance = new Decimal(this.updates.balance).add(delta).toString();
    }
    addBalance(amount) {
        this.updateBalance(amount);
    }
    deductBalance(amount) {
        this.updateBalance(new Decimal(amount).neg()); // Convert the delta to negative
    }

    /*
    // Method to update the vote weight
    addVoteWeight(amount) {
        this.voteWeightUpdate = new Decimal(this.voteWeightUpdate).add(amount).toString();
    }
    deductVoteWeight(amount) {
        this.voteWeightUpdate = new Decimal(this.voteWeightUpdate).sub(amount).toString();
    }
    */

    // Method to increase the action count
    increaseActionCount(amount = 1) {
        this.actionCountIncrease += amount;
    }

    // Method to update the last action hash
    updateLastActionHash(hash) {
        this.updates.lastActionHash = hash;
    }

    // Method to update the start action (for the recipient account)
    addAction(action) {
        // If the action was already added for this account, skip (e.g. self-send)
        if(this.newActionHashes.has(action.hash))
            return;

        // Verify and update nonce of the sender account before processing action
        if(action.account == this.accountId)
            this.verifyAndUpdateNonce(action.nonce);

        // Existing addAction logic
        if(this.account.startAction == null) {
            this.updates.startAction = action.hash;
            
            if(this.account.delegator == null)
                this.updates.delegator = this.accountId; // We make the account its own delegator by default
        }

        this.increaseActionCount(1);
        this.updateLastActionHash(action.hash);
        this.newActionHashes.add(action.hash);
    }

    // Method to check if the account is new
    unopenedAccount() {
        return this.account.startAction == null ? true : false;
    }

    // Method to get the balance
    getBalance() {
        if (this.updates.balance)
            return this.updates.balance;

        return this.account.balance;
    }

    getDelegator() {
        if (this.updates.delegator)
            return this.updates.delegator;

        return this.account.delegator;
    }
    setDelegator(delegator) {
        this.updates.delegator = delegator;
    }

    getLastActionHash() {
        if (this.updates.lastActionHash)
            return this.updates.lastActionHash;

        return this.account.lastActionHash;
    }

    // Set a custom property
    setCustomProperty(name, value) {
        this.updates[name] = value;
    }
    
    // Set a custom property once, error if it was already set
    setCustomPropertyOnce(name, value) {
        if (name in this.updates) {
            throw new Error(`Conflict: Property '${name}' is already set. Cannot change to '${value}'.`);
        }
        this.updates[name] = value;
    }

    // Get a custom property
    getCustomProperty(name) {
        if (Object.prototype.hasOwnProperty.call(this.updates, name))
            return this.updates[name];
        if (Object.prototype.hasOwnProperty.call(this.account, name))
            return this.account[name];
        return null;
    }

    // Initialize a custom property if it doesn't already exist
    initCustomProperty(fieldName, value) {
        if (this.account[fieldName] == null)
            this.updates[fieldName] = value;
    }

    // Method to specify a field increase
    setFieldIncrease(fieldName, amount) {
        // Store the increase for later application in the apply method
        this.fieldIncreases[fieldName] = amount;
    }

    // Add action to account history
    addActionToHistory(actionHash) {
        if (this.newActionHashes.includes(actionHash))
            return;
        
        this.newActionHashes.push(actionHash);
    }

    // Get current nonce
    getNonce() {
        return this.updates.nonce !== undefined ? this.updates.nonce : (this.account.nonce || 0);
    }

    // Verify and update nonce for an action
    verifyAndUpdateNonce(actionNonce) {
        const currentNonce = this.getNonce();
        
        // Verify the action's nonce matches account's current nonce
        if (actionNonce !== currentNonce) {
            throw new Error(`Invalid nonce. Expected: ${currentNonce}, Got: ${actionNonce}`);
        }

        // Increment nonce by 1 for the action
        this.updates.nonce = currentNonce + 1;
    }

    // NEW: Validate that all updates are acceptable.
    // For example, check that pending balance doesn't go negative, required fields are set, etc.
    validate() {
        const errors = [];
        
        // Check balance
        const pendingBalance = new Decimal(this.getBalance() || 0);
        if (pendingBalance.isNegative()) {
            errors.push(`Balance would be negative: ${pendingBalance.toString()}`);
        }

        // Validate nonce only increases
        if (this.updates.nonce !== undefined && this.updates.nonce <= (this.account.nonce || 0)) {
            errors.push('Nonce can only increase');
        }

        if (errors.length > 0) {
            return { valid: false, errors };
        }
        return { valid: true };
    }

    hasUpdates() {
        return Object.keys(this.updates).length > 0 || Object.keys(this.fieldIncreases).length > 0;
    }

    // ------------------------------------------------------------
    // Helper methods for vote weight changes
    // ------------------------------------------------------------
    addVoteWeightChange(delegator, amount) {
        // amount is positive for additions, negative for deductions
        this.voteWeightChanges.push({ delegator, amount });
    }
    getVoteWeightChanges() {
        return this.voteWeightChanges;
    }

    // ------------------------------------------------------------
    // Commit the updates
    // ------------------------------------------------------------
    commit() {
        // Original apply logic for real updates
        // Apply the action count increase if set
        if (this.actionCountIncrease)
            this.account.actionCount = parseInt(this.account.actionCount || 0) + this.actionCountIncrease;

        // Update account history
        if (this.newActionHashes.size > 0) {
            this.account.history = [...this.account.history, ...this.newActionHashes];
        }

        // Apply the stored field increases
        for (const fieldName in this.fieldIncreases) {
            if (this.account[fieldName]) {
                const previousFieldValue = this.account[fieldName];
                // Apply the increase to the field
                // Check if previousFieldValue is a string with a period or a number that's a float
                if (typeof previousFieldValue === 'string' && previousFieldValue.includes('.') || typeof previousFieldValue === 'number' && previousFieldValue % 1 !== 0) {
                    // Add as a float
                    this.account[fieldName] = parseFloat(previousFieldValue || 0) + parseFloat(this.fieldIncreases[fieldName]);
                } else {
                    // Add as an integer
                    this.account[fieldName] = parseInt(previousFieldValue || 0) + parseInt(this.fieldIncreases[fieldName]);
                }
            } else {
                // If the field doesn't exist, initialize it with the increase value
                this.account[fieldName] = this.fieldIncreases[fieldName];
            }
        }
        
        // Track voteweight changes if balance or delegator changes
        if(this.account.balance != this.updates.balance || this.account.delegator != this.updates.delegator) {
            // Remove weight from old delegator if account had a balance
            if(new Decimal(this.account.balance).gt(0)) {
                this.addVoteWeightChange(
                    this.account.delegator,
                    new Decimal(this.account.balance).neg().toString() // Make it negative for removal
                );
            }

            // Add weight to new delegator
            if(new Decimal(this.account.balance).gt(0) || this.updates.balance) {
                const delegator = this.updates.delegator ? this.updates.delegator : this.account.delegator;
                const balance = this.updates.balance ? this.updates.balance : this.account.balance;
                this.addVoteWeightChange(delegator, balance);
            }
        }

        // Apply the updates to the account object
        if(this.hasUpdates()) {
            Object.assign(this.account, this.updates);
        }
    }
}

module.exports = AccountUpdate;
