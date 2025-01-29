const BaseBlockValidator = require('../../../../../core/blockprocessors/base/basevalidator');

class FileBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        // Set validation checks explicitly
        this.setValidationChecks(['signature']); // TODO: Add fromAccount
        this.setFinalValidationChecks(['timestamp', 'hash']);
        
        // Add file-specific schema properties
        this.addSchemaProperties({
            type: { type: 'string', enum: ['file'] },
            contentType: { type: 'string' },
            fileName: { type: 'string' },
            isEncrypted: { type: 'boolean' },
            data: { type: 'string', nullable: true },
            delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', nullable: true },
            timestamp: { type: 'number' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }
        }, [
            'type', 'contentType', 'fileName', 'isEncrypted', 'delegator',
            'timestamp', 'signature'
        ]);

        this.setAdditionalProperties(false);
    }

    // Using default validation methods from base class
}

module.exports = FileBlockValidator;
