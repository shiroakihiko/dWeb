const BaseInstructionProcessor = require('../../../../../core/system/instruction/base/baseinstructionprocessor');
const Hasher = require('../../../../../core/utils/hasher.js');

class IndexInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async customProcessInstruction(processData) {
        const { instruction, action, accountManager } = processData;
        
        // Store content info in recipient account
        const accountRecipient = accountManager.getAccountUpdate(instruction.toAccount);
        accountRecipient.setCustomProperty('contentInfo', {
            title: instruction.title,
            description: instruction.description,
            content: instruction.content,
            timestamp: instruction.timestamp
        });

        // Update term indices
        for (const token of instruction.tokens) {
            const termAccount = accountManager.getAccountUpdate(
                await Hasher.hashText('term:' + token)
            );
            
            const docs = termAccount.getCustomProperty('docs') || [];
            docs.push({
                contentId: instruction.toAccount,
                weight: 1 / instruction.tokens.length,
                timestamp: instruction.timestamp
            });
            
            termAccount.setCustomProperty('docs', docs);
            termAccount.addAction(action);
        }
    }
}

module.exports = IndexInstructionProcessor;