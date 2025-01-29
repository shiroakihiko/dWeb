const BaseBlockValidator = require('../../../../../core/blockprocessors/base/basevalidator.js');
const BlockHelper = require('../../../../../core/utils/blockhelper.js');

class RewardBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        // Set custom validation checks
        this.setFinalValidationChecks(['timestamp', 'hash']);
        
        // Add reward-specific schema properties
        this.addSchemaProperties({
            type: { type: 'string', enum: ['reward'] },
            timestamp: { type: 'number' },
            consensusBlock: { type: 'object' },
            delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', nullable: true },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }
        }, ['type', 'consensusBlock', 'amount', 'timestamp', 'signature']);

        this.setAdditionalProperties(false);

        this.addBasicCheck(this.basicCheck.bind(this));
        this.addFinalCheck(this.finalCheck.bind(this));
    }

    async basicCheck(block) {
        if(!this.sharedValidator.signedByNetwork(block.consensusBlock)) {
            return { state: 'INVALID_NETWORK_SIGNATURES' };
        }

        return this.validNodeSignature(block);
    }

    async finalCheck(block) {
        const validNodeSignature = this.validNodeSignature(block);
        if(validNodeSignature.state !== 'VALID') {
            return validNodeSignature;
        }

        if(!this.sharedValidator.signedByNetwork(block.consensusBlock)) {
            return { state: 'INVALID_NETWORK_SIGNATURES' };
        }

        return { state: 'VALID' };
    }

    validNodeSignature(block) {
        if(!BlockHelper.verifySignatureWithPublicKey(block, block.signature, block.delegator)) {
            return { state: 'INVALID_SIGNATURE' };
        }
        return { state: 'VALID' };
    }
}

module.exports = RewardBlockValidator;
