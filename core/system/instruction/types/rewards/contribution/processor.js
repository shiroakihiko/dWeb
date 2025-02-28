const BaseInstructionProcessor = require('../../../base/baseinstructionprocessor.js');

class RewardInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async processInstruction(processData) {
        const { instruction, action, accountManager } = processData;

        // Get accounts involved
        const accountSender = accountManager.getAccountUpdate(action.account);
        const accountRecipient = accountManager.getAccountUpdate(instruction.toAccount);

        // Only initialize sender with action, no balance deduction
        accountSender.addAction(action);

        // Add reward to recipient
        accountRecipient.addAction(action);
        accountRecipient.addBalance(instruction.amount);
        //(accountManager.getAccountUpdate(accountRecipient.getDelegator()))
        //    .addVoteWeight(instruction.amount);
        
        if (!accountManager.isDryRun()) {
            this.network.ledger.stats.inc('TOTAL_REWARDS', instruction.amount);
            this.network.ledger.increaseSupply(instruction.amount);
        }
    }
}

module.exports = RewardInstructionProcessor;