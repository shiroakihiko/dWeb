const Ajv = require('ajv');
const SharedValidator = require('../shared/sharedvalidator.js');

class BaseBlockValidator {
    constructor(network) {
        this.network = network;
        this.sharedValidator = new SharedValidator(network);
        this.feeHandler = null;
        
        // Initialize validation checks arrays
        this.basicChecks = [];
        this.finalChecks = [];
        this.consensusChecks = [];
        this.validationChecks = [];
        this.finalValidationChecks = [];
        
        // Initialize schema properties
        this.schemaProperties = {
            type: 'object',
            properties: {
                fromAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                toAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                amount: { type: ['string', 'number'] }
                //...this.chainLinker.getSchemaProperties()
            },
            required: [],
            additionalProperties: true
        };
    }

    // Add a custom basic validation check
    addBasicCheck(checkFunction) {
        this.basicChecks.push(checkFunction);
    }

    // Add a custom final validation check
    addFinalCheck(checkFunction) {
        this.finalChecks.push(checkFunction);
    }

    // Add a custom consensus validation check
    addConsensusCheck(checkFunction) {
        this.consensusChecks.push(checkFunction);
    }

    // Method to validate blocks schema, fees and custom checks
    // Used to check for properly formatted block structure of blocks sent by the user through RPC or other peers
    async validate(block) {
        if(this.validationChecks.length > 0) {
            const validation = await this.sharedValidator.validateBlock(block, this.validationChecks, this.blockSchema());
            if(validation.state != 'VALID') {
                return validation;
            }
        }

        // Validate fee if handler exists
        if (this.feeHandler) {
            if (!this.feeHandler.validateFee(block)) {
                return { state: 'INVALID_FEE' };
            }
        }

        // Run all basic checks
        for (const check of this.basicChecks) {
            const result = await check(block);
            if (result.state !== 'VALID') {
                return result;
            }
        }

        return { state: 'VALID' };
    }

    // Method to validate block prior to ledger entry after additional changes to the block (e.g. hash, validator signatures)
    async validateFinal(block) {
        // Include basic validation
        const basicValidation = await this.validate(block);
        if(basicValidation.state != 'VALID') {
            return basicValidation;
        }

        // Validate chain links
        //if (!(await this.chainLinker.validatePreviousBlocks(block))) {
        //    return { state: 'PREVIOUS_BLOCK_MISMATCH' };
        //}

        const validation = await this.sharedValidator.validateBlock(block, this.finalValidationChecks, this.blockSchema());
        if(validation.state != 'VALID') {
            return validation;
        }

        // Run all final checks
        for (const check of this.finalChecks) {
            const result = await check(block);
            if (result.state !== 'VALID') {
                return result;
            }
        }

        return { state: 'VALID' };
    }

    // Optional method to validate network consensus for general consensus on what data needs to be valid and match the local data (e.g. delegated timestamp)
    // Used mostly for consensus blocks (e.g. rewards, network updates) that are node initiated and not user initiated where we need to find overall consensus from all nodes
    async validateNetworkConsensus(block) {
        for (const check of this.consensusChecks) {
            const result = await check(block);
            if (result.state !== 'VALID') {
                return result;
            }
        }

        return { state: 'VALID' };
    }

    // Set which properties to validate in initial validation
    setValidationChecks(checks) {
        this.validationChecks = checks;
    }

    // Set which properties to validate in final validation
    setFinalValidationChecks(checks) {
        this.finalValidationChecks = checks;
    }

    // Add properties to the schema
    addSchemaProperties(properties, required) {
        this.schemaProperties.properties = {
            ...this.schemaProperties.properties,
            ...properties
        };
        this.schemaProperties.required = required;
    }

    // Set whether additional properties are allowed
    setAdditionalProperties(allowed) {
        this.schemaProperties.additionalProperties = allowed;
    }

    // Get the complete schema
    blockSchema() {
        return this.schemaProperties;
    }

    // Set fee handler and update schema
    setFeeHandler(feeHandler) {
        this.feeHandler = feeHandler;
        
        if (!feeHandler) {
            // Remove fee property if no fee handler
            delete this.schemaProperties.properties.fee;
            const feeIndex = this.schemaProperties.required.indexOf('fee');
            if (feeIndex > -1) {
                this.schemaProperties.required.splice(feeIndex, 1);
            }
            return;
        }

        const feeSchema = feeHandler.getSchemaProperties();
        if (feeSchema.properties) {
            this.schemaProperties.properties.fee = feeSchema.properties.fee;
        }
        if (!this.schemaProperties.required.includes('fee')) {
            this.schemaProperties.required.push('fee');
        }
    }
}

module.exports = BaseBlockValidator; 