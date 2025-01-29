const BaseBlockValidator = require('../../../../../core/blockprocessors/base/basevalidator');

class CommentBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        // Set validation checks explicitly
        this.setValidationChecks(['fromAccount', 'toAccount', 'delegator', 'signature']);
        this.setFinalValidationChecks(['timestamp', 'hash']);
        
        // Add comment-specific schema properties
        this.addSchemaProperties({
            type: { type: 'string', enum: ['comment'] },
            comment: { type: 'string' },
            data: { type: 'string', nullable: true },
            delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', nullable: true },
            timestamp: { type: 'number' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }
        }, [
            'type', 'comment', 'delegator', 'timestamp',
            'signature'
        ]);

        this.setAdditionalProperties(false);

        this.addBasicCheck(this.basicCheck.bind(this));
        this.addFinalCheck(this.finalCheck.bind(this));
    }

    async basicCheck(block) {
        if(!(await this.activeProposal(block))) {
            return { state: 'INVALID_PROPOSAL' };
        }
        return { state: 'VALID' };
    }

    async finalCheck(block) {
        if(!(await this.activeProposal(block))) {
            return { state: 'INVALID_PROPOSAL' };
        }
        return { state: 'VALID' };
    }

    // Helper method to check if proposal is active
    async activeProposal(block) {
        const proposalAccount = await this.network.ledger.getAccount(block.toAccount);
        if(proposalAccount && (proposalAccount.status == 'active')) {
            return true;
        }
        return false;
    }
}

module.exports = CommentBlockValidator;
