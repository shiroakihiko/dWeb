class AccountUpdate {

    constructor(account) {
        this.account = account; // The account to be updated
        this.updates = {}; // Store the updates to apply to the account
        this.fieldIncreases = {}; // Track field increases
        this.blockCountIncrease = 0;
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

    // Apply all the updates to the account
    apply() {
        // Apply the block count increase if set
        if (this.blockCountIncrease)
            this.account.blockCount = parseInt(this.account.blockCount || 0) + this.blockCountIncrease;

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
