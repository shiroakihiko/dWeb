const BaseInstructionProcessor = require('../../../../../core/system/instruction/base/baseinstructionprocessor');
const Hasher = require('../../../../../core/utils/hasher.js');

class TransferInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async customProcessInstruction(processData) {
        const { instruction, action, accountManager } = processData;
        
        const accountPresentOwner = accountManager.getAccountUpdate(action.account);
        const accountNewOwner = accountManager.getAccountUpdate(instruction.toAccount);
        const accountDomain = accountManager.getAccountUpdate(await Hasher.hashText(instruction.domainName));

        // Update present owner's default domain if needed
        if (accountPresentOwner.getCustomProperty('defaultDomain') == instruction.domainName) {
            accountPresentOwner.setCustomPropertyOnce(
                'defaultDomain', 
                this.getNewDefaultDomain(action.account, instruction.domainName)
            );
        }

        // Set as default domain for new owner if they don't have one
        if (accountNewOwner.getCustomProperty('defaultDomain') == null) {
            accountNewOwner.setCustomPropertyOnce('defaultDomain', instruction.domainName);
        }

        // Use the new method to update domain ownership
        accountDomain.setCustomPropertyOnce('owner', instruction.toAccount);
    }

    getNewDefaultDomain(owner, excludeDomain = null) {
        const history = this.network.ledger.getAccountHistory(owner);
        for (let i = 0; i < history.length; i++) {
            const action = history[i];
            if (action.instruction.type == 'register' && action.instruction.domainName != excludeDomain)
                return action.instruction.domainName;
        }
        return null;
    }
}

module.exports = TransferInstructionProcessor;