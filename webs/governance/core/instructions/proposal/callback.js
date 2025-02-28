const crypto = require('crypto');
const BaseInstructionCallback = require('../../../../../core/system/instruction/base/baseinstructioncallback');
const Hasher = require('../../../../../core/utils/hasher');

class ProposalInstructionCallback extends BaseInstructionCallback {
    constructor(network) {
        super(network);
        this.lastCallTime = false;
        this.proposalDuration = 60; // 60 Seconds temporary. 86400 = 24 hours in seconds
        this.pendingVoteEndElections = new Map();
    }

    // Callback on the proposal action that ends it and passes on the final results to the target network
    async instructionCallback(callbackData) {
        const instruction = callbackData.instruction;
        const action = callbackData.action;

        const proposalHash = action.hash;
        const proposalAccount = await Hasher.hashText(`proposalAccount(${proposalHash})`);
        const currentTimestamp = Math.floor(Date.now() / 1000);
        if (currentTimestamp - Math.floor(parseInt(action.timestamp) / 1000) < this.proposalDuration)
            return false; // Proposal is not yet ended
        
        // Only one call per minute
        if(this.lastCallTime !== false && (currentTimestamp - this.lastCallTime) < 60)
            return false;
        this.lastCallTime = currentTimestamp;
        
        // Check if the proposal has been marked as ended already (which means we already processed a voteend action)
        if(this.network.ledger.getAccount(proposalAccount).status == 'ended')
        {
            await this.network.ledger.actionCallbacks.removeCallback(action.hash);
            return true;
        }

        // Create a new vote-end action that ends a proposal
        const createResult = await this.network.actionManager.createAction({
            type: 'voteend',
            account: proposalAccount,
            delegator: proposalAccount,
            proposalHash: proposalHash
        });
        if(createResult.state == 'VALID')
        {
            this.network.consensus.proposeAction(createResult.action);
            await this.network.ledger.actionCallbacks.removeCallback(action.hash);
        }
        else
        {
            this.network.node.error('Failed to create vote-end action', createResult);
        }
        return true; // Proposal ended
    }
}

module.exports = ProposalInstructionCallback;