const ContainerProcessor = require('../../../containers/processor.js');
const Decimal = require('decimal.js');
const ContainerHelper = require('../../../utils/containerhelper.js');

class ElectedValidatorSelector {
    constructor(network) {
        this.network = network;
        
        // Configuration
        this.minimumStakePercentage = 1;
        this.validatorTimeoutMs = 10000; // 10 seconds per validator
        
        // State
        this.validatorTimeout = null;
        this.fallbackCallbacks = [];
    }

    // Initialization
    async initialize() {
        const validator = await this.getCurrentValidator();
        await this.network.ledger.setCurrentValidator(validator);
        await this.startValidatorTimer();
        this.network.node.log("Validator selector initialized - validator: " + validator);
    }

    // Core validator selection logic
    async getCurrentValidator() {
        const lastContainer = await this.network.ledger.getLastContainer();
        if (!lastContainer){ 
            this.network.node.log("No last container found");
            return null;
        }

        // Get eligible validators sorted by stake
        const eligibleValidators = await this.getEligibleValidators();
        if (eligibleValidators.length === 0) {
            this.network.node.log("No eligible validators found");
            return null;
        }

        // Calculate time elapsed since last container
        const timeElapsed = Date.now() - lastContainer.timestamp;
        const validatorIndex = Math.floor(timeElapsed / this.validatorTimeoutMs);
        
        // Round robin selection
        return eligibleValidators[validatorIndex % eligibleValidators.length].nodeId;
    }

    async getEligibleValidators() {
        // Get all validators
        const validators = await this.network.ledger.getNetworkValidatorWeights();
        if (!validators) return null;

        // Calculate total weight
        let totalWeight = new Decimal(0);
        for (const stake of Object.values(validators)) {
            totalWeight = totalWeight.plus(new Decimal(stake));
        }

        this.network.node.log("Eligible validators: " + JSON.stringify(validators));

        // Filter validators based on minimum stake percentage and sort by weight
        return Object.entries(validators)
            .filter(([_, stake]) => {
                const percentage = new Decimal(stake).div(totalWeight).times(100);
                return percentage.gte(this.minimumStakePercentage);
            })
            .map(([nodeId, stake]) => ({
                nodeId,
                weight: new Decimal(stake)
            }))
            .sort((a, b) => b.weight.minus(a.weight).toNumber());
    }

    // Event handlers
    async onNewContainer() {
        try {
            await this.startValidatorTimer();
        } catch (err) {
            this.network.node.error('Validator selection error:', err);
        }
    }

    // Timeout management
    async startValidatorTimer() {
        if (this.validatorTimeout) {
            clearTimeout(this.validatorTimeout);
        }

        const currentValidator = await this.getCurrentValidator();
        await this.network.ledger.setCurrentValidator(currentValidator);

        this.validatorTimeout = setTimeout(async () => {
            const nextValidator = await this.getCurrentValidator();
            if (nextValidator && nextValidator !== currentValidator) {
                this.network.node.log(`Switching validator from ${currentValidator} to ${nextValidator}`);
                
                if (nextValidator === this.network.node.nodeId) {
                    await this.triggerFallbacks();
                }
            }
            await this.startValidatorTimer();
        }, this.validatorTimeoutMs);
    }

    // Utility methods
    async getRecentSignatureRates(nodeIds) {
        const containers = await this.network.ledger.getRecentContainers(this.recentContainerWindow);
        const rates = {};
        
        for (const nodeId of nodeIds) {
            const signedCount = containers.filter(container => 
                container.validatorSignatures[nodeId]).length;
            rates[nodeId] = containers.length > 0 ? signedCount / containers.length : 0;
        }
        
        return rates;
    }

    // Fallback callbacks
    onFallback(callback) {
        this.fallbackCallbacks.push(callback);
    }

    async triggerFallbacks() {
        for (const callback of this.fallbackCallbacks) {
            await callback();
        }
    }

    // Public getters
    async getValidator() {
        return await this.getCurrentValidator();
    }

    // Return all active validators as an array
    async getActiveValidators() {
        const validators = await this.getEligibleValidators();
        return validators.map(validator => validator.nodeId);
    }
}

module.exports = ElectedValidatorSelector; 