const Hasher = require('../../../../../utils/hasher');
const BaseInstructionValidator = require('../../../base/baseinstructionvalidator');

class ClaimInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['swapClaim'] },
            secret: { type: 'string' }
        }, [
            'type',
            'secret'
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

        // Check if swap creator is the same as the sender
        if (swapAccount.getCustomProperty('owner') === action.account) {
            return { state: 'SWAP_CREATOR_SAME_AS_SENDER' };
        }
        
        // Check if swap creator has the correct hash lock
        const hashLock = await Hasher.hashText(`swapSecret(${instruction.secret})`);
        if (swapAccount.getCustomProperty('hashLock') !== hashLock) {
            return { state: 'SWAP_CREATOR_HASH_LOCK_MISMATCH' };
        }

        return { state: 'VALID' };
    }
}

module.exports = ClaimInstructionValidator;


