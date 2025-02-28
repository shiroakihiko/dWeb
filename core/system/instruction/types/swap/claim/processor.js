const Decimal = require('decimal.js');
const BaseInstructionProcessor = require('../../../base/baseinstructionprocessor');

class ClaimInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async processInstruction(processData) {
        const { instruction, action, accountManager } = processData;

        if (instruction.type !== 'swapClaim') {
            throw new Error('Invalid instruction type for ClaimInstructionProcessor');
        }

        // Get accounts involved in claim
        const accountClaimer = accountManager.getAccountUpdate(action.account);
        const accountSwap = accountManager.getAccountUpdate(instruction.toAccount);

        // Unlock the balance being swapped
        accountClaimer.updateBalance(
            new Decimal(accountClaimer.getBalance())
                .plus(accountSwap.getBalance())
                .toString()
        );
        accountClaimer.addAction(action);

        // Remove the balance from the swap account
        accountSwap.updateBalance('0');
        accountSwap.addAction(action);
        accountSwap.setCustomProperty('status', 'claimed');

        if (!accountManager.isDryRun()) {
            // Remove callback to monitor swap completion/timeout
            this.network.ledger.actionCallbacks.removeCallback(accountSwap.getCustomProperty('swapHash'));

            // Notify target network
            this.network.node.sendTargetNetwork(instruction.targetNetwork, {
                type: 'swapClaim',
                swapHash: action.hash,
                linkedSwapHash: instruction.linkedSwapHash,
                secret: instruction.secret,
                action: action
            });
        }
    }
}

module.exports = ClaimInstructionProcessor;