const Decimal = require('decimal.js');
class BaseInstructionProcessor {
    constructor(network) {
        this.network = network;
    }

    async processInstruction(processData) {        
        const { instruction, action, accountManager } = processData;

        const accountSender = accountManager.getAccountUpdate(action.account);
        const accountRecipient = accountManager.getAccountUpdate(instruction.toAccount);

        // Update account actions
        if (action.account) {
            accountSender.addAction(action);
        }
        if (instruction.toAccount) {
            accountRecipient.addAction(action);
        }
        /*
        if (action.delegator) { // TODO: Can be removed? Displaying rewards affecting the delegator, bloats the account unnecessarily?
            accountSenderDelegator.addAction(action);
        }*/

        // Process balance changes
        if (instruction.amount) {
            //this.network.node.verbose(`Processing instructions for action: ${action.hash}`);
            // Update sender
            if (action.account) {
                const deductAmount = new Decimal(instruction.amount || 0);
                if (instruction.fee) {
                    deductAmount.add(instruction.fee.amount || 0);
                }
                accountSender.deductBalance(deductAmount);
                //accountSenderDelegator.deductVoteWeight(deductAmount);
            }

            // Update recipient
            if (instruction.toAccount) {
                accountRecipient.addBalance(instruction.amount);
                //(accountManager.getAccountUpdate(accountRecipient.getDelegator())).addVoteWeight(instruction.amount);
            }

            // Update delegator
            if (action.delegator && instruction.fee && instruction.fee.delegatorReward) {
                const accountSenderDelegator = accountManager.getAccountUpdate(action.delegator);
                accountSenderDelegator.addBalance(instruction.fee.delegatorReward);
                //(accountManager.getAccountUpdate(accountSenderDelegator.getDelegator())).addVoteWeight(instruction.fee.delegatorReward);
            }
        }

        if(this.customProcessInstruction) {
            this.customProcessInstruction(processData);
        }
    }
}

module.exports = BaseInstructionProcessor;
