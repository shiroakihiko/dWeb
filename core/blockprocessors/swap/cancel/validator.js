const Decimal = require('decimal.js');
const BaseBlockValidator = require('../../base/basevalidator');

class CancelBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        this.setValidationChecks(['fromAccount', 'toAccount', 'hash']);
        this.setFinalValidationChecks(['timestamp']);
        
        this.addSchemaProperties({
            type: { type: 'string', enum: ['swapCancel'] },
            fromAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            toAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            amount: { type: ['string', 'number'] },
            timestamp: { type: 'number' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }
        }, [
            'type', 'fromAccount', 'toAccount', 'amount', 'timestamp', 'signature'
        ]);

        this.setAdditionalProperties(false);
        this.addFinalCheck(this.finalCheck.bind(this));
    }

    async finalCheck(block) {
        // Check if deadline has passed
        if (block.deadline < Math.floor(Date.now() / 1000)) {
            return { state: 'DEADLINE_EXPIRED' };
        }

        // Check if swap account exists
        const swapAccount = await this.network.ledger.getAccount(block.toAccount);
        if (!swapAccount) {
            return { state: 'SWAP_ACCOUNT_NOT_FOUND' };
        }

        // Check if swap account is in pending state
        if (swapAccount.status !== 'pending') {
            return { state: 'SWAP_ACCOUNT_NOT_PENDING' };
        }

        // Check if swap account owner is the same as the sender
        if (swapAccount.owner !== block.fromAccount) {
            return { state: 'SWAP_ACCOUNT_OWNER_MISMATCH' };
        }

        return { state: 'VALID' };
    }
}

module.exports = CancelBlockValidator;


