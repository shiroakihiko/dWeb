const Decimal = require('decimal.js');

class ElectedValidatorSelector {
    constructor(network) {
        this.network = network;
        
        // Configuration
        this.minimumStakePercentage = 1;
        this.validatorTimeoutMs = 10000; // 10 seconds per validator
        
        // State
        this.validatorTimeout = null;
        this.validatorSwitchCallbacks = [];
        this.lastValidator = null; // Cache to store the current validator
    }

    // Initialization
    async initialize() {
        const validator = this.getCurrentValidator();
        await this.network.ledger.setCurrentValidator(validator);
        this.startValidatorTimer();
        this.network.node.log("Validator selector initialized - validator: " + validator);
    }
    Stop() {
        if(this.validatorTimeout) {
            clearTimeout(this.validatorTimeout);
        }
    }

    // Core validator selection logic
    getCurrentValidator() {
        const lastBlock = this.network.ledger.getLastBlock();
        if (!lastBlock){ 
            this.network.node.log("No last block found");
            return null;
        }

        // Get eligible validators sorted by stake
        const eligibleValidators = this.getEligibleValidators();
        if (eligibleValidators.length === 0) {
            this.network.node.log("No eligible validators found");
            return null;
        }

        // Calculate time elapsed since last block
        const timeElapsed = Date.now() - lastBlock.timestamp;
        const validatorIndex = Math.floor(timeElapsed / this.validatorTimeoutMs);
        
        // Round robin selection
        const electedValidator = eligibleValidators[validatorIndex % eligibleValidators.length].nodeId;

        this.network.node.log("Eligible validators: " + JSON.stringify(eligibleValidators) + " - Elected validator: " + electedValidator);
        return electedValidator;
    }

    getEligibleValidators() {
        // Get all validators
        const validators = this.network.ledger.getNetworkValidatorWeights();
        if (!validators) return null;

        // Calculate total weight
        let totalWeight = new Decimal(0);
        for (const stake of Object.values(validators)) {
            totalWeight = totalWeight.plus(new Decimal(stake));
        }

        // Filter validators based on minimum stake percentage and sort by weight
        const filteredValidators = Object.entries(validators)
            .filter(([_, stake]) => {
                const percentage = new Decimal(stake).div(totalWeight).times(100);
                return percentage.gte(this.minimumStakePercentage);
            })
            .map(([nodeId, stake]) => ({
                nodeId,
                weight: new Decimal(stake)
            }))
            .sort((a, b) => b.weight.minus(a.weight).toNumber());

        return filteredValidators;
    }

    // Event handlers
    onNewBlock() {
        try {
            this.startValidatorTimer();
        } catch (err) {
            this.network.node.error('Validator selection error:', err);
        }
    }

    // Timeout management
    startValidatorTimer() {
        // Clear any existing timeouts
        if (this.validatorTimeout) {
            clearTimeout(this.validatorTimeout);
        }

        // Get the last block to synchronize the timer based on its timestamp
        const lastBlock = this.network.ledger.getLastBlock();
        let delay = this.validatorTimeoutMs; // Default fallback delay

        if (lastBlock && lastBlock.timestamp) {
            const now = Date.now();
            const elapsedSinceBlock = now - lastBlock.timestamp;
            // Calculate remainder time until the next validator switch slot
            const remainder = elapsedSinceBlock % this.validatorTimeoutMs;
            delay = this.validatorTimeoutMs - remainder;
            this.network.node.log(
                `Calculated timer delay: ${delay}ms (elapsed: ${elapsedSinceBlock}ms, remainder: ${remainder}ms)`
            );
        } else {
            this.network.node.log("No last block timestamp available. Using default validatorTimeoutMs");
        }

        // Set the current validator immediately based on calculated timing
        const currentValidator = this.getCurrentValidator();
        this.network.ledger.setCurrentValidator(currentValidator); //async! not reliable to pull from ledger

        // Set timeout to re-check/switch the validator after the computed delay
        this.validatorTimeout = setTimeout(() => {
            const nextValidator = this.getCurrentValidator();
            if (nextValidator && nextValidator !== currentValidator) {
                this.network.node.log(`Switching validator from ${currentValidator} to ${nextValidator}`);
                this.triggerValidatorSwitch(nextValidator);
            }
            // Recursively call to continue the process
            this.startValidatorTimer();
        }, delay);
    }

    // Utility methods
    getRecentSignatureRates(nodeIds) {
        const blocks = this.network.ledger.getRecentBlocks(this.recentBlockWindow);
        const rates = {};
        
        for (const nodeId of nodeIds) {
            const signedCount = blocks.filter(block => 
                block.validatorSignatures[nodeId]).length;
            rates[nodeId] = blocks.length > 0 ? signedCount / blocks.length : 0;
        }
        
        return rates;
    }

    // Validator switch callbacks
    onValidatorSwitch(callback) {
        this.validatorSwitchCallbacks.push(callback);
    }

    triggerValidatorSwitch(newValidator) {
        for (const callback of this.validatorSwitchCallbacks) {
            callback(newValidator);
        }
    }

    // Public getters
    getValidator() {
        return this.getCurrentValidator();
    }

    // Return all active validators as an array
    getActiveValidators() {
        const validators = this.getEligibleValidators();
        return validators.map(validator => validator.nodeId);
    }

    isValidator(nodeId) {
        return this.getActiveValidators().includes(nodeId);
    }
}

module.exports = ElectedValidatorSelector; 