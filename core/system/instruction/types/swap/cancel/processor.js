const BaseInstructionProcessor = require('../../../base/baseinstructionprocessor');

class CancelInstructionProcessor extends BaseInstructionProcessor {
    constructor(network, validator) {
        super(network, validator);
    }

    async processInstruction(processData) {
        const { instruction, action, accountManager } = processData;

        const accountSender = accountManager.getAccountUpdate(action.account);
        const accountDelegator = accountManager.getAccountUpdate(action.delegator);
        const accountSwap = accountManager.getAccountUpdate(instruction.toAccount);

        // Unlock the balance being swapped
        accountSender.addAction(action);
        accountSender.addBalance(accountSwap.getBalance());

        // Remove the balance from the swap account
        accountSwap.addAction(action);
        accountSwap.updateBalance('0');
        accountSwap.setCustomProperty('status', 'cancelled');

        // Handle delegator rewards if present
        if (action.delegator && instruction.fee && instruction.fee.delegatorReward) {
            accountDelegator.addAction(action);
            accountDelegator.addBalance(instruction.fee.delegatorReward);
            //(accountManager.getAccountUpdate(accountDelegator.getDelegator()))
            //    .addVoteWeight(instruction.fee.delegatorReward);
        }

        if (!accountManager.isDryRun()) {
            // Remove callback to monitor swap completion/timeout
            this.network.ledger.actionCallbacks.removeCallback(accountSwap.getCustomProperty('swapHash'));

            // Notify target network
            this.network.node.sendTargetNetwork(action.instruction.targetNetwork, {
                type: 'swapCancel',
                swapHash: action.hash,
                linkedSwapHash: action.instruction.linkedSwapHash,
                action: action
            });
        }
    }
}

module.exports = CancelInstructionProcessor;