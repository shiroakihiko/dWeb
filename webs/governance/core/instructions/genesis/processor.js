const BaseInstructionProcessor = require('../../../../../core/system/instruction/base/baseinstructionprocessor.js');

class GenesisInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async processInstruction(processData) {
        const { instruction, action, accountManager } = processData;
        // Create genesis account
        const account = accountManager.getAccountUpdate(instruction.toAccount);
        account.addAction(action);
        account.addBalance(instruction.amount);
        account.setCustomProperty('delegator', action.delegator); // We specifically set the delegator, new accounts have themselves as delegator by default

        const accountDelegator = accountManager.getAccountUpdate(action.delegator);
        //accountDelegator.addVoteWeight(instruction.amount);
         // Initial voting power on governance proposals 
        accountDelegator.initCustomProperty('votingPower', '1');
        accountDelegator.initCustomProperty('totalRewards', '0');

        // Update supply stats
        if (!accountManager.isDryRun()) {
            this.network.ledger.increaseSupply(instruction.amount);
        }

        console.log(`Genesis instruction processed in action ${action.hash} for account ${instruction.toAccount}`);
    }
}

module.exports = GenesisInstructionProcessor;
