const BlockProcessor = require('../../system/block/processor.js');
const PendingActionManager = require('./action/pendingactionmanager.js');
const ElectionManager = require('./election/electionmanager.js');
const ProposalManager = require('./block/proposalmanager.js');
const ValidatorSelector = require('./primaryvalidator/validatorselector.js');
const CrossNetworkMessage = require('../../system/crossnetwork/crossmessage.js');

class DPoSConsensus {
    constructor(network) {
        this.network = network;
        this.blockProcessor = new BlockProcessor(network);
        this.pendingActionManager = new PendingActionManager(network);
        this.electionManager = new ElectionManager(network);
        this.proposalManager = new ProposalManager(network);
        this.validatorSelector = new ValidatorSelector(network);
        this.crossNetworkMessage = new CrossNetworkMessage(network);
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.validatorSelector.initialize();
        await this.proposalManager.initialize();

        this.validatorSelector.onValidatorSwitch((newValidator) => {
            this.network.node.log(`Validator switch to ${newValidator}`);
            if(newValidator === this.network.node.nodeId && this.network.consensus.electionManager.activeElections.size === 0) {
                this.proposalManager.process();
            }
        });

        this.pendingActionManager.onActionsAdded((actions) => {
            this.proposalManager.process();
        });
        
        this.initialized = true;
    }
    Stop() {
        if(this.validatorSelector)
            this.validatorSelector.Stop();
        if(this.pendingActionManager)
            this.pendingActionManager.Stop();
        if(this.electionManager)
            this.electionManager.Stop();
    }

    async proposeActions(actions, confirmationCallbacks = null) {
        this.network.node.log(`Proposing ${actions.length} actions`);
        
        const addedActions = await this.pendingActionManager.addActions(actions, confirmationCallbacks, this.network.node.nodeId);
        
        this.network.node.log(`Added ${addedActions.length} actions to pending`);
        
        // Broadcast all successful actions at once
        //if (addedActions.length > 0) {
            this.proposalManager.process();
       // }

        return addedActions.length;
    }

    async proposeAction(action, confirmationCallback = null) {
        const added = await this.pendingActionManager.addAction(action, confirmationCallback ? confirmationCallback : null, this.network.node.nodeId);
        this.proposalManager.process();
        return added;
    }

    async proposalConfirmed(proposal) {
        const block = proposal.block;
        const result = await this.blockProcessor.addBlock(block);
        if (result.state !== 'BLOCK_ADDED') {
            this.network.node.error(`Failed to add block ${block.hash}: ${result.state} ${JSON.stringify(result)}`);
            return;
        }

        // Cleanup any related state
        this.pendingActionManager.removeConfirmedActions(
            proposal.block.actions.map(d => d.hash),
            block
        );

        // Update confirmed active validators
        this.validatorSelector.onNewBlock();
        
        // Clean up confirmed actions and trigger callbacks
        const actionHashes = block.actions.map(d => d.hash);
        this.pendingActionManager.removeConfirmedActions(actionHashes);

        // Send out cross-network actions
        this.crossNetworkMessage.sendCrossNetworkActions(block);

        // Broadcast confirmations
        this.network.node.broadcaster.broadcastActionConfirmations(block.actions, block);
        this.network.node.broadcaster.broadcastBlockConfirmation(block);

        // Clean up state
        this.proposalManager.proposalCompleted(proposal.hash);
    }
}

module.exports = DPoSConsensus;