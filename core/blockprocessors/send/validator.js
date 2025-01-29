const BaseBlockValidator = require('../base/basevalidator');

class SendBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        // Set validation checks explicitly
        this.setValidationChecks(['fee', 'fromAccount', 'signature']); //'delegator', 
        this.setFinalValidationChecks(['timestamp', 'hash']);
        
        // Add send-specific schema properties
        this.addSchemaProperties({
            type: { type: 'string', enum: ['send'] },
            delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            data: { type: 'string', nullable: true },
            timestamp: { type: 'number' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }
        }, [
            'type', 'delegator', 'timestamp', 'signature'
        ]);

        this.setAdditionalProperties(false);
    }
}

module.exports = SendBlockValidator;
