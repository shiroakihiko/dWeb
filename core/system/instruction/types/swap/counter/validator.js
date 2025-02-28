const Decimal = require('decimal.js');
const BaseInstructionValidator = require('../../../base/baseinstructionvalidator');

class CounterInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['swapOffer'] },
            targetNetwork: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            deadline: { type: 'number' },
            minReceived: { type: ['string', 'number'] }
        }, [
            'type', 'targetNetwork', 'deadline', 'minReceived'
        ]);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;

        // Check if deadline has passed
        if (instruction.deadline < Math.floor(Date.now() / 1000)) {
            return { state: 'DEADLINE_EXPIRED' };
        }

        // Check if sender has enough balance
        const senderAccount = accountManager.getAccountUpdate(action.account);
        const balance = new Decimal(senderAccount.getBalance() || '0');
        if (balance.lessThan(instruction.amount)) {
            return { state: 'INSUFFICIENT_BALANCE' };
        }

        return { state: 'VALID' };
    }
}

module.exports = CounterInstructionValidator;


