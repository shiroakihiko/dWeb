const BaseBlockValidator = require('../base/basevalidator');

class ChangeBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        // Set validation checks explicitly
        this.setValidationChecks(['fee', 'fromAccount', 'delegator', 'signature']);
        this.setFinalValidationChecks(['timestamp', 'hash']);
        
        // Add change-specific schema properties
        this.addSchemaProperties({
            type: { type: 'string', enum: ['change'] },
            delegator: { type: 'string' },
            data: { type: 'string', nullable: true },
            timestamp: { type: 'number' },
            fee: { type: 'string' },
            delegatorReward: { type: 'string' },
            burnAmount: { type: 'string' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }
        }, [
            'type', 'delegator', 'timestamp', 'fee', 'delegatorReward',
            'burnAmount', 'signature'
        ]);

        this.setAdditionalProperties(false);
    }
}

module.exports = ChangeBlockValidator;
