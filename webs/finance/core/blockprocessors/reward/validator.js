const Ajv = require('ajv');
const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const Decimal = require('decimal.js');
const BlockFeeCalculator = require('../../../../../core/blockprocessors/shared/feecalculator.js');
const SharedValidator = require('../../../../../core/blockprocessors/shared/sharedvalidator.js');

class RewardBlockValidator {
    constructor(network) {
        this.network = network;
        this.sharedValidator = new SharedValidator(network);
        // Initialize the FeeDistributionCalculator class
        this.feeCalculator = new BlockFeeCalculator(network);
    }

    // Method to validate the send block using the schema and custom validation functions
    validate(block) {
        //'fee', 'fromAccount', 'toAccount', 'delegator', 
        const basicCheck = this.sharedValidator.validateBlock(block, ['previousBlockMatch'], this.blockSchema());
        if(basicCheck.state != 'VALID')
            return basicCheck;
        
        if(!this.sharedValidator.signedByNetwork(block.consensusBlock))
            return { state: 'INVALID_NETWORK_SIGNATURES' };
        
        const validNodeSignature = this.validNodeSignature(block);
        if(validNodeSignature.state != 'VALID')
            return validNodeSignature;
        
        return { state: 'VALID' };
    }

    // Final validation prior ledger entry
    validateFinal(block)
    {
        // #1 Check structure
        //'fee', 'fromAccount', 'toAccount', 'delegator', 
        const basicCheck = this.sharedValidator.validateBlock(block, ['timestamp', 'hash', 'previousBlockMatch'], this.blockSchema());
        if(basicCheck.state != 'VALID')
            return basicCheck;
        
        // #2 Check the nodes signature (this is independant of the consensusBlock signature check)
        const validNodeSignature = this.validNodeSignature(block);
        if(validNodeSignature.state != 'VALID')
            return validNodeSignature;
        
        // #3 Check delegators of originating network signed off on the consensusBlcok
        if(!this.sharedValidator.signedByNetwork(block.consensusBlock))
            return { state: 'INVALID_NETWORK_SIGNATURES' };
        

        return { state: 'VALID' };
    }

    // Schema definition for SendBlock
    blockSchema() {
        return {
            type: 'object',
            properties: {
                type: { type: 'string', enum: ['reward'] },
                fromAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                toAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                amount: { type: ['string', 'number'] },
                delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', nullable: true },
                previousBlockSender: { type: 'string', nullable: true },
                previousBlockRecipient: { type: 'string', nullable: true },
                previousBlockDelegator: { type: 'string', nullable: true },
                //message: { type: 'string' },
                consensusBlock: { type: 'object' },
                timestamp: { type: 'number' },
                //hash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },  // Ensure hash is a valid hex string
                //fee: { type: 'string' },
                //delegatorReward: { type: 'string' },
                //burnAmount: { type: 'string' },
                signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }, // Base64 pattern
                //validatorSignatures: { type: 'object' }
            },
            required: [
                'type', 'fromAccount', 'toAccount', 'amount', 'delegator',
                'previousBlockSender', 'previousBlockRecipient', 'previousBlockDelegator',
                'consensusBlock', 'timestamp', //'fee', 'delegatorReward', 'burnAmount',
                'signature',// 'hash', 'validatorSignatures'
            ],
            additionalProperties: false
        };
    }
    
    // Usually we can use the signature check of the shared validator but the fromAccount is no longer
    // the signer, but the originating network.
    // In this case the delegator field is the node (public key) that signed the block. 
    validNodeSignature(block)
    {
        if(!BlockHelper.verifySignatureWithPublicKey(block, block.signature, block.delegator))
            return { state: 'INVALID_SIGNATURE' };
        
        return { state: 'VALID' };
    }
}

module.exports = RewardBlockValidator;
