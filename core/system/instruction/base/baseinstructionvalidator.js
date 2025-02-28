const Ajv = require('ajv');
const SharedValidator = require('../../shared/sharedvalidator.js');

class BaseInstructionValidator {
    constructor(network) {
        this.network = network;
        this.sharedValidator = new SharedValidator(network);
        this.feeHandler = null;
        
        // Initialize validation checks arrays
        this.instructionChecks = ['fee'];
        
        // Base instruction schema - to be extended by child classes
        this.instructionSchema = {
            type: 'object',
            properties: {
                toAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                amount: { type: ['string', 'number'] }
            },
            required: ['type', 'toAccount']
        };
    }

    setInstructionChecks(checks) {
        this.instructionChecks = checks;
    }

    async validateInstruction(validationData) {
        const { instruction, action, accountManager } = validationData;
        
        // Schema and basic checks
        const instructionValidation = await this.sharedValidator.validateInstruction(
            instruction,
            this.instructionChecks,
            this.instructionSchema
        );
        if (instructionValidation.state !== 'VALID') {
            return instructionValidation;
        }

        // Validate fee
        if(this.feeHandler) {
            const validFee = this.feeHandler.validateFee(instruction);
            if (!validFee) {
                return { state: 'INVALID_FEE' };
            }
        }

        // Custom validation
        if(this.customValidation) {
            const customValidation = await this.customValidation(validationData);
            if (customValidation.state !== 'VALID') {
                return customValidation;
            }
        }

        return { state: 'VALID' };
    }

    setFeeHandler(feeHandler) {
        this.feeHandler = feeHandler;
        if (feeHandler) {
            const feeSchema = feeHandler.getSchemaProperties();
            if (feeSchema.properties) {
                this.instructionSchema.properties.fee = feeSchema.properties.fee;
            }
            if (!this.instructionSchema.required.includes('fee')) {
                this.instructionSchema.required.push('fee');
            }
        }
    }

    addInstructionProperties(properties, required = []) {
        // Replace existing properties and add new ones
        Object.keys(properties).forEach(key => {
            this.instructionSchema.properties[key] = properties[key];
        });

        // Add any new required fields that don't already exist
        required.forEach(field => {
            if (!this.instructionSchema.required.includes(field)) {
                this.instructionSchema.required.push(field);
            }
        });
    }
}

module.exports = BaseInstructionValidator; 