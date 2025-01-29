const Decimal = require('decimal.js');
const BaseBlockValidator = require('../../base/basevalidator');

class ClaimBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        this.setValidationChecks(['fromAccount', 'toAccount', 'hash']);
        this.setFinalValidationChecks(['timestamp']);
        
        this.addSchemaProperties({
            type: { type: 'string', enum: ['swapClaim'] },
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

        // Check if swap creator is the same as the sender
        if (swapAccount.owner === block.fromAccount) {
            return { state: 'SWAP_CREATOR_SAME_AS_SENDER' };
        }
        
        // Check if swap creator has the correct hash lock
        const hashLock = crypto.createHash('sha256').update(`swapSecret(${block.secret})`).digest('hex');
        if (swapAccount.getCustomProperty('hashLock') !== hashLock) {
            return { state: 'SWAP_CREATOR_HASH_LOCK_MISMATCH' };
        }

        return { state: 'VALID' };
    }
}

module.exports = ClaimBlockValidator;


