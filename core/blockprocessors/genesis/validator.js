const Ajv = require('ajv');
const BlockHelper = require('../../utils/blockhelper.js');
const Decimal = require('decimal.js');
const SharedValidator = require('../shared/sharedvalidator.js');

class GenesisBlockValidator {
    constructor(network) {
        this.network = network;
        this.sharedValidator = new SharedValidator(network);
    }

    // Method to validate the genesis block using the schema and custom validation functions
    validate(block) {
        const validation = this.sharedValidator.validateBlock(block, ['hash', 'signature'], this.blockSchema());
        if(validation.state != 'BLOCK_VALID')
            return validation;

        if(!this.validNewGenesis())
            return { state: 'GENESIS_EXISTS' };

        return { state: 'VALID' };
    }

    // Final validation prior ledger entry
    validateFinal(block)
    {
        return this.validate(block);
    }

    // Schema definition for GenesisBlock
    blockSchema() {
        return {
            type: 'object',
            properties: {
                type: { type: 'string', enum: ['genesis'] },
                fromAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                toAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                amount: { type: 'string' },
                delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                previousBlockSender: { type: 'string', nullable: true },
                previousBlockRecipient: { type: 'string', nullable: true },
                previousBlockDelegator: { type: 'string', nullable: true },
                data: { type: 'string', nullable: true },
                timestamp: { type: 'number' },
                // hash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },  // Ensure hash is a valid hex string
                fee: { type: 'string' },
                delegatorReward: { type: 'string' },
                burnAmount: { type: 'string' },
                randomHash: { type: 'string' },
                signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }, // Base64 pattern
                // validatorSignatures: { type: 'object' }
            },
            required: [
                'type', 'fromAccount', 'toAccount', 'amount', 'delegator',
                'timestamp', 'fee', 'delegatorReward', 'burnAmount',
                'randomHash', 'signature', // 'hash', 'validatorSignatures'
            ],
            additionalProperties: false
        };
    }

    validNewGenesis() {
        return this.network.ledger.getTotalBlockCount() === 0 && this.network.ledger.getTotalAccountCount();
    }
}

module.exports = GenesisBlockValidator;
