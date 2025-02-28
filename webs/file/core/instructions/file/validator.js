const BaseInstructionValidator = require('../../../../../core/system/instruction/base/baseinstructionvalidator');

class FileInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['file'] },
            contentType: { type: 'string' },
            fileName: { type: 'string' },
            isEncrypted: { type: 'boolean' }
        }, [
            'type',
            'contentType',
            'fileName',
            'isEncrypted'
        ]);
    }

    // Using default validation methods from base class
}

module.exports = FileInstructionValidator;
