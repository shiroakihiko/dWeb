const Ajv = require('ajv');
const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const Decimal = require('decimal.js');
const BlockFeeCalculator = require('../../../../../core/blockprocessors/shared/feecalculator.js');
const SharedValidator = require('../../../../../core/blockprocessors/shared/sharedvalidator.js');

class ProposalBlockValidator {
    constructor(network) {
        this.network = network;
        this.sharedValidator = new SharedValidator(network);
        // Initialize the FeeDistributionCalculator class
        this.feeCalculator = new BlockFeeCalculator(network);
    }

    // Method to validate the send block using the schema and custom validation functions
    validate(block) {
        //'fee', 'fromAccount'
        return this.sharedValidator.validateBlock(block, ['delegator', 'previousBlockMatch', 'signature'], this.blockSchema());
    }

    // Final validation prior ledger entry
    validateFinal(block)
    {
        if(this.proposalExist(block))
            return { state: 'PROPOSAL_EXISTS' };
        
        //'fee', 'fromAccount'
        return this.sharedValidator.validateBlock(block, ['timestamp', 'hash', 'delegator', 'previousBlockMatch', 'signature'], this.blockSchema());
    }
    proposalExist(block) {
        const proposalAccount = this.network.ledger.getAccount(block.hash);
        return proposalAccount ? true : false; 
    }

    // Schema definition for SendBlock
    blockSchema() {
        return {
            type: 'object',
            properties: {
                type: { type: 'string', enum: ['proposal'] },
                fromAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                toAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                amount: { type: ['string', 'number'] },
                delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', nullable: true },
                previousBlockSender: { type: 'string', nullable: true },
                previousBlockRecipient: { type: 'string', nullable: true },
                previousBlockDelegator: { type: 'string', nullable: true },
                title: { type: 'string' },
                description: { type: 'string' },
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
                'title', 'description', 'timestamp', 'fee', 'delegatorReward', 'burnAmount',
                'signature',// 'hash', 'validatorSignatures'
            ],
            additionalProperties: false
        };
    }
}

module.exports = ProposalBlockValidator;
