const Decimal = require('decimal.js');
const BaseBlockValidator = require('../../base/basevalidator');

class OfferBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        this.setValidationChecks(['signature', 'balance', 'deadline']);
        this.setFinalValidationChecks(['timestamp', 'hash']);
        
        this.addSchemaProperties({
            type: { type: 'string', enum: ['swapOffer'] },
            fromAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            toAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            amount: { type: ['string', 'number'] },
            targetNetwork: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            deadline: { type: 'number' },
            minReceived: { type: ['string', 'number'] },
            delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', nullable: true },
            timestamp: { type: 'number' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }
        }, [
            'type', 'fromAccount', 'toAccount', 'amount', 'targetNetwork',
            'deadline', 'minReceived', 'delegator', 'timestamp', 'signature'
        ]);

        this.setAdditionalProperties(false);
        this.addFinalCheck(this.finalCheck.bind(this));
    }

    async finalCheck(block) {
        // Check if deadline has passed
        if (block.deadline < Math.floor(Date.now() / 1000)) {
            return { state: 'DEADLINE_EXPIRED' };
        }

        // Check if sender has enough balance
        const senderAccount = await this.network.ledger.getAccount(block.fromAccount);
        const balance = new Decimal(senderAccount.balance || '0');
        if (balance.lessThan(block.amount)) {
            return { state: 'INSUFFICIENT_BALANCE' };
        }

        return { state: 'VALID' };
    }
}

module.exports = OfferBlockValidator;


