const BaseBlockValidator = require('../../../../../core/blockprocessors/base/basevalidator');

class DefaultBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        this.setValidationChecks(['fromAccount', 'signature']);
        this.setFinalValidationChecks(['timestamp', 'hash']);
        
        this.addSchemaProperties({
            type: { type: 'string', enum: ['default'] },
            thumbnailId: { type: 'string' },
            fromAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            toAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', nullable: true },
            timestamp: { type: 'number' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }
        }, [
            'type', 'thumbnailId', 'delegator', 'fromAccount', 'toAccount',
            'timestamp', 'signature'
        ]);

        this.setAdditionalProperties(false);

        this.addBasicCheck(this.basicCheck.bind(this));
    }

    async basicCheck(block) {
        // Verify the thumbnail exists
        const thumbnail = await this.network.ledger.getBlock(block.thumbnailId);
        if (!thumbnail || thumbnail.type !== 'thumbnail') {
            return { state: 'THUMBNAIL_NOT_FOUND' };
        }

        // Verify ownership
        if (thumbnail.fromAccount !== block.fromAccount) {
            return { state: 'THUMBNAIL_NOT_OWNED' };
        }

        if (block.toAccount !== block.fromAccount) {
            return { state: 'CANT_SET_DEFAULT_FOR_OTHER_ACCOUNT' };
        }

        // Check if this thumbnail is already the default
        const account = await this.network.ledger.getAccount(block.fromAccount);
        if (account && account.defaultThumbnail === block.thumbnailId) {
            return { state: 'THUMBNAIL_ALREADY_DEFAULT' };
        }

        return { state: 'VALID' };
    }
}

module.exports = DefaultBlockValidator; 