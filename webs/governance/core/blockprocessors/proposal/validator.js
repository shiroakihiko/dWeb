const Ajv = require('ajv');
const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const Decimal = require('decimal.js');
const BlockFeeCalculator = require('../../../../../core/blockprocessors/shared/feecalculator.js');
const SharedValidator = require('../../../../../core/blockprocessors/shared/sharedvalidator.js');
const BaseBlockValidator = require('../../../../../core/blockprocessors/base/basevalidator');

class ProposalBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        // Set validation checks explicitly
        this.setValidationChecks(['signature']); //'delegator', 
        this.setFinalValidationChecks(['timestamp', 'hash']);
        
        // Add genesis-specific schema properties
        this.addSchemaProperties({
            type: { type: 'string', enum: ['proposal'] },
            fromAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            toAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            amount: { type: ['string', 'number'] },
            delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', nullable: true },
            title: { type: 'string' },
            description: { type: 'string' },
            timestamp: { type: 'number' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }, // Base64 pattern
        }, [
            'type', 'fromAccount', 'toAccount', 'amount', 'delegator',
            'title', 'description', 'timestamp', 'signature'
        ]);

        this.setAdditionalProperties(false);

        this.addFinalCheck(this.finalCheck.bind(this));
    }

    async finalCheck(block)
    {
        if(await this.proposalExist(block))
            return { state: 'PROPOSAL_EXISTS' };
        
        return { state: 'VALID' };
    }

    async proposalExist(block) {
        const proposalAccount = await this.network.ledger.getAccount(block.hash);
        return proposalAccount ? true : false; 
    }
}

module.exports = ProposalBlockValidator;
