// Methods may be called multiple times (e.g. in case fromAccount is the same as the toAccount)
// this class is used to prevent issues of inproper changes through multiple calls by
// using the same reference and overwriting values instead of adding to them.
class AccountUpdate {

    constructor(account) {
        this.account = account; // The account to be updated
        this.updates = {}; // Store the updates to apply to the account
        this.fieldIncreases = {}; // Track field increases
        this.blockCountIncrease = 0;
        this.newBlockHashes = []; // Track new blocks affecting this account
    }

    // Method to increase the block count
    setBlockCountIncrease(amount = 1) {
        this.blockCountIncrease = amount;
    }

    // Method to update the balance
    updateBalance(newBalance) {
        this.updates.balance = newBalance;
    }

    // Method to update the last block hash
    updateLastBlockHash(hash) {
        this.updates.lastBlockHash = hash;
    }

    // Method to check if the account is new
    isNewAccount() {
        return this.account.startBlock == null ? true : false;
    }

    // Method to update the start block (for the recipient account)
    initWithBlock(block) {
        // Only update start block if it hasn't been set yet
        if(this.account.startBlock == null) {
            this.updates.startBlock = block.hash;
            this.updates.delegator = block.fromAccount;
        }
        this.addBlockToHistory(block.hash);
    }

    // Method to get the balance
    getBalance() {
        if (this.updates.balance)
            return this.updates.balance;

        return this.account.balance;
    }

    getLastBlockHash() {
        if (this.updates.lastBlockHash)
            return this.updates.lastBlockHash;

        return this.account.lastBlockHash;
    }

    // Set a custom property
    setCustomProperty(name, value) {
        this.updates[name] = value;
    }

    // Get a custom property
    getCustomProperty(name) {
        if(this.updates[name])
            return this.updates[name];

        if(this.account[name])
            return this.account[name];

        return null;
    }

    // Initialize a custom property if it doesn't already exist
    initCustomProperty(fieldName, value) {
        if (this.account[fieldName] == null)
            this.updates[fieldName] = value;
    }

    // Method to specify a field increase
    increaseField(fieldName, amount) {
        // Store the increase for later application in the apply method
        this.fieldIncreases[fieldName] = amount;
    }

    // Add block to account history
    addBlockToHistory(blockHash) {
        if (this.newBlockHashes.includes(blockHash))
            return;

        console.log('Adding block to history:', blockHash);
        this.newBlockHashes.push(blockHash);
    }

    // Apply all the updates to the account
    apply() {
        // Apply the block count increase if set
        if (this.blockCountIncrease)
            this.account.blockCount = parseInt(this.account.blockCount || 0) + this.blockCountIncrease;

        // Update account history
        if (!this.account.history) {
            this.account.history = [];
        }
        this.account.history = [...this.account.history, ...this.newBlockHashes];

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

        // Apply the other updates to the account
        Object.assign(this.account, this.updates);
    }
}

module.exports = AccountUpdate;
