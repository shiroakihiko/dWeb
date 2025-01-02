const Ajv = require('ajv');
const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const Decimal = require('decimal.js');
const BlockFeeCalculator = require('../../../../../core/blockprocessors/shared/feecalculator.js');
const SharedValidator = require('../../../../../core/blockprocessors/shared/sharedvalidator.js');

class CommentBlockValidator {
    constructor(network) {
        this.network = network;
        this.sharedValidator = new SharedValidator(network);
        // Initialize the FeeDistributionCalculator class
        this.feeCalculator = new BlockFeeCalculator(network);
    }

    // Method to validate the send block using the schema and custom validation functions
    validate(block) {
        //'fee', 
        const basicCheck = this.sharedValidator.validateBlock(block, ['fromAccount', 'toAccount', 'delegator', 'previousBlockMatch', 'signature'], this.blockSchema());
        if(basicCheck.state != 'VALID')
            return basicCheck;
        
        if(!this.activeProposal(block))
            return { state: 'INVALID_PROPOSAL' };
        
        return { state: 'VALID' };
    }

    // Final validation prior ledger entry
    validateFinal(block)
    {
        //'fee', 
        const basicCheck = this.sharedValidator.validateBlock(block, ['timestamp', 'hash', 'fromAccount', 'toAccount', 'delegator', 'previousBlockMatch', 'signature'], this.blockSchema());
        if(basicCheck.state != 'VALID')
            return basicCheck;
        
        if(!this.activeProposal(block))
            return { state: 'INVALID_PROPOSAL' };
        
        return { state: 'VALID' };
    }
    activeProposal(block) {
        const proposalAccount = this.network.ledger.getAccount(block.toAccount);
        if(proposalAccount && (proposalAccount.status == 'active')) 
            return true;
        
        return false;
    }

    // Schema definition for SendBlock
    blockSchema() {
        return {
            type: 'object',
            properties: {
                type: { type: 'string', enum: ['comment'] },
                fromAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                toAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                amount: { type: ['string', 'number'] },
                delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', nullable: true },
                previousBlockSender: { type: 'string', nullable: true },
                previousBlockRecipient: { type: 'string', nullable: true },
                previousBlockDelegator: { type: 'string', nullable: true },
                message: { type: 'string' },
                timestamp: { type: 'number' },
                //hash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },  // Ensure hash is a valid hex string
                fee: { type: 'string' },
                delegatorReward: { type: 'string' },
                burnAmount: { type: 'string' },
                signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }, // Base64 pattern
                //validatorSignatures: { type: 'object' }
            },
            required: [
                'type', 'fromAccount', 'toAccount', 'amount', 'delegator',
                'previousBlockSender', 'previousBlockRecipient', 'previousBlockDelegator',
                'message', 'timestamp', 'fee', 'delegatorReward', 'burnAmount',
                'signature',// 'hash', 'validatorSignatures'
            ],
            additionalProperties: false
        };
    }
}

module.exports = CommentBlockValidator;
