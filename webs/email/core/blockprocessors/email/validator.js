const BaseBlockValidator = require('../../../../../core/blockprocessors/base/basevalidator');

class EmailBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        // Set validation checks explicitly
        this.setValidationChecks(['delegator', 'signature']);
        this.setFinalValidationChecks(['timestamp', 'hash']);
        
        // Add email-specific schema properties
        this.addSchemaProperties({
            type: { type: 'string', enum: ['email'] },
            content: { type: 'string' },
            members: { type: 'object' },
            data: { type: 'string', nullable: true },
            delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', nullable: true },
            timestamp: { type: 'number' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }
        }, [
            'type', 'content', 'members', 'delegator',
            'timestamp', 'signature'
        ]);

        this.setAdditionalProperties(false);
    }

    // Using default validation methods from base class
}

module.exports = EmailBlockValidator;
