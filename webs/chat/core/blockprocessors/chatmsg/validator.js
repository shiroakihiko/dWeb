const BaseBlockValidator = require('../../../../../core/blockprocessors/base/basevalidator');

class ChatMSGBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        // Set validation checks explicitly
        this.setValidationChecks(['signature']); //'fromAccount', 
        this.setFinalValidationChecks(['timestamp', 'hash']);
        
        // Add chatmsg-specific schema properties
        this.addSchemaProperties({
            type: { type: 'string', enum: ['chatmsg'] },
            message: { type: 'string' },
            data: { type: 'string', nullable: true },
            delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', nullable: true },
            timestamp: { type: 'number' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }
        }, [
            'type', 'message', 'delegator', 'timestamp', 'signature'
        ]);

        this.setAdditionalProperties(false);
    }
}

module.exports = ChatMSGBlockValidator;
