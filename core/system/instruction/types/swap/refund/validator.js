const Decimal = require('decimal.js');
const BaseInstructionValidator = require('../../../base/baseinstructionvalidator');

class RefundInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['swapRefund'] }
        }, [
            'type'
        ]);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;

        // Check if swap account exists
        const swapAccount = accountManager.getAccountUpdate(instruction.toAccount);
        if (swapAccount.unopenedAccount()) {
            return { state: 'SWAP_ACCOUNT_NOT_FOUND' };
        }

        // Check if swap account is in pending state
        if (swapAccount.getCustomProperty('status') !== 'pending') {
            return { state: 'SWAP_ACCOUNT_NOT_PENDING' };
        }

        // Check if swap account owner is the same as the sender
        if (swapAccount.getCustomProperty('owner') !== action.account) {
            return { state: 'SWAP_ACCOUNT_OWNER_MISMATCH' };
        }

        return { state: 'VALID' };
    }
}

module.exports = RefundInstructionValidator;


