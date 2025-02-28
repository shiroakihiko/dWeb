const Hasher = require('../../../../../core/utils/hasher.js');
const BaseInstructionProcessor = require('../../../../../core/system/instruction/base/baseinstructionprocessor');

class ProposalInstructionProcessor extends BaseInstructionProcessor {
    constructor(network) {
        super(network);
    }

    async customProcessInstruction(processData) {
        const { instruction, action, accountManager } = processData;
        
        // Create a proposal account with the hash of the proposal action
        const accountProposalHash = await Hasher.hashText(`proposalAccount(${action.hash})`);
        const accountProposal = accountManager.getAccountUpdate(accountProposalHash);

        // Initialize proposal-specific properties
        accountProposal.addAction(action);
        accountProposal.initCustomProperty('status', 'active');
        accountProposal.initCustomProperty('votes', '0');
        accountProposal.initCustomProperty('totalVotingScore', '0');
        accountProposal.initCustomProperty('totalVotingPower', '0');

        if(!accountManager.isDryRun())
        {
            // Add callback with action hash
            await this.network.ledger.actionCallbacks.addCallback(
                action.hash, 
                'proposal'
            );
        }
    }
}

module.exports = ProposalInstructionProcessor;
