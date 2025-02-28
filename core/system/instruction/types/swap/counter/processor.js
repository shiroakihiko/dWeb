const Decimal = require('decimal.js');
const BaseInstructionProcessor = require('../../../base/baseinstructionprocessor.js');

class CounterInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async processInstruction(processData) {
        const { instruction, action, accountManager } = processData;

        if (instruction.type !== 'swapCounter') {
            throw new Error('Invalid instruction type for CounterInstructionProcessor');
        }

        // Get accounts involved in swap
        const accountSender = accountManager.getAccountUpdate(action.account);
        const accountSwap = accountManager.getAccountUpdate(instruction.toAccount);

        // Lock the balance being swapped
        const senderBalance = new Decimal(accountSender.account.balance);
        accountSender.updateBalance(
            senderBalance
                .minus(instruction.amount)
                .minus(instruction.fee.amount)
                .toString()
        );
        accountSender.addAction(action);
        
        // Initialize swap state account
        accountSwap.addAction(action);
        accountSwap.updateBalance(
            new Decimal(accountSwap.getBalance())
                .plus(instruction.amount)
                .toString()
        );

        // Initialize swap state
        accountSwap.initCustomProperty('status', 'pending');
        accountSwap.initCustomProperty('amount', instruction.amount);
        accountSwap.initCustomProperty('sender', action.account);
        accountSwap.initCustomProperty('recipient', instruction.toAccount);
        accountSwap.initCustomProperty('deadline', instruction.deadline.toString());
        accountSwap.initCustomProperty('minReceived', instruction.minReceived);
        accountSwap.initCustomProperty('swapHash', action.hash);
        accountSwap.initCustomProperty('hashLock', instruction.hashLock);

        if (instruction.linkedSwapHash) {
            accountSwap.initCustomProperty('linkedSwapHash', instruction.linkedSwapHash);
        }

        if (!accountManager.isDryRun()) {
            // Add callback to monitor swap completion/timeout
            this.network.ledger.actionCallbacks.addCallback(action.hash, 'swapCounter');
    
            // Notify target network
            this.network.node.sendTargetNetwork(instruction.targetNetwork, {
                type: 'swapRequest',
                swapHash: action.hash,
                linkedSwapHash: instruction.linkedSwapHash,
                action: action
            });
        }
    }
}

module.exports = CounterInstructionProcessor;