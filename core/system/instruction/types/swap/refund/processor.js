const Decimal = require('decimal.js');
const BaseInstructionProcessor = require('../../../base/baseinstructionprocessor.js');

class RefundInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async processInstruction(processData) {
        const { instruction, action, accountManager } = processData;

        if (instruction.type !== 'swapRefund') {
            throw new Error('Invalid instruction type for RefundInstructionProcessor');
        }

        // Get accounts involved in refund
        const accountSender = accountManager.getAccountUpdate(action.account);
        const accountSwap = accountManager.getAccountUpdate(instruction.toAccount);

        // Return the locked balance
        accountSender.updateBalance(
            new Decimal(accountSender.getBalance())
                .plus(accountSwap.getBalance())
                .toString()
        );
        accountSender.addAction(action);  

        // Clear swap account
        accountSwap.updateBalance('0');
        accountSwap.addAction(action);
        accountSwap.setCustomProperty('status', 'cancelled');

        // Remove callback to monitor swap completion/timeout
        this.network.ledger.actionCallbacks.removeCallback(accountSwap.getCustomProperty('swapHash'));

        // Notify target network
        this.network.node.sendTargetNetwork(instruction.targetNetwork, {
            type: 'swapCancel',
            swapHash: action.hash,
            linkedSwapHash: instruction.linkedSwapHash,
            action: action
        });
    }
}

module.exports = RefundInstructionProcessor;