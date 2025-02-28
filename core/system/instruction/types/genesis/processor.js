const Decimal = require('decimal.js');
const BaseInstructionProcessor = require('../../base/baseinstructionprocessor.js');

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
        account.setCustomProperty('delegator', action.delegator);

        const accountDelegator = accountManager.getAccountUpdate(action.delegator);
        accountDelegator.setDelegator(action.delegator); // Validator has itself as delegator
        //accountDelegator.addVoteWeight(instruction.amount);

        // Update supply stats
        if (!accountManager.isDryRun()) {
            this.network.ledger.increaseSupply(instruction.amount);
        }

        console.log(`Genesis instruction processed in action ${action.hash} for account ${instruction.toAccount}`);
    }
}

module.exports = GenesisInstructionProcessor;

