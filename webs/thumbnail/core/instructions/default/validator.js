const BaseInstructionValidator = require('../../../../../core/system/instruction/base/baseinstructionvalidator');

class DefaultInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['default'] },
            thumbnailId: { type: 'string' }
        }, [
            'type',
            'thumbnailId'
        ]);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;
        
        // Verify the thumbnail exists
        const thumbnail = this.network.ledger.getAction(instruction.thumbnailId);
        if (!thumbnail || thumbnail.type !== 'thumbnail') {
            return { state: 'THUMBNAIL_NOT_FOUND' };
        }

        // Verify ownership
        if (thumbnail.account !== action.account) {
            return { state: 'THUMBNAIL_NOT_OWNED' };
        }

        if (instruction.toAccount !== action.account) {
            return { state: 'CANT_SET_DEFAULT_FOR_OTHER_ACCOUNT' };
        }

        // Check if this thumbnail is already the default
        const account = accountManager.getAccountUpdate(action.account);
        if (account && account.getCustomProperty('defaultThumbnail') === instruction.thumbnailId) {
            return { state: 'THUMBNAIL_ALREADY_DEFAULT' };
        }

        return { state: 'VALID' };
    }
}

module.exports = DefaultInstructionValidator; 