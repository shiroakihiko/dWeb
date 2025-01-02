const Ajv = require('ajv');
const BlockHelper = require('../../utils/blockhelper.js');
const Decimal = require('decimal.js');
const BlockFeeCalculator = require('../shared/feecalculator.js');
const SharedValidator = require('../shared/sharedvalidator.js');

class ChangeBlockValidator {
    constructor(network) {
        this.network = network;
        this.sharedValidator = new SharedValidator(network);
    }

    // Method to validate the change block using the schema and custom validation functions
    validate(block) {
        return this.sharedValidator.validateBlock(block, ['fee', 'fromAccount', 'delegator', 'previousBlockMatch', 'signature'], this.blockSchema());
    }

    // Final validation prior ledger entry
    validateFinal(block)
    {
        return this.sharedValidator.validateBlock(block, ['timestamp', 'hash', 'fee', 'fromAccount', 'delegator', 'previousBlockMatch', 'signature'], this.blockSchema());
    }

    // Schema definition for ChangeBlock
    blockSchema() {
        return {
            type: 'object',
            properties: {
                type: { type: 'string', enum: ['change'] },
                fromAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                toAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                amount: { type: ['string', 'number'] },
                delegator: { type: 'string' },
                previousBlockSender: { type: 'string' },
                previousBlockRecipient: { type: 'string' },
                previousBlockDelegator: { type: 'string' },
                data: { type: 'string', nullable: true },
                timestamp: { type: 'number' },
                // hash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },  // Ensure hash is a valid hex string
                fee: { type: 'string' },
                delegatorReward: { type: 'string' },
                burnAmount: { type: 'string' },
                signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }, // Base64 pattern
                // validatorSignatures: { type: 'object' }
            },
            required: [
                'type', 'fromAccount', 'toAccount', 'amount', 'delegator',
                'previousBlockSender', 'previousBlockRecipient', 'previousBlockDelegator',
                'timestamp', 'fee', 'delegatorReward', 'burnAmount',
                'signature', //'hash', 'validatorSignatures'
            ],
            additionalProperties: false
        };
    }
}

module.exports = ChangeBlockValidator;
