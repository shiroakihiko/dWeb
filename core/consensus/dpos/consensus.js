const ContainerProcessor = require('../../containers/processor.js');
const PendingBlockManager = require('./blocks/pendingblockmanager.js');
const ElectionManager = require('./election/electionmanager.js');
const ProposalManager = require('./containers/proposalmanager.js');
const ValidatorSelector = require('./primaryvalidator/validatorselector.js');

class DPoSConsensus {
    constructor(network) {
        this.network = network;
        this.containerProcessor = new ContainerProcessor(network);
        this.pendingBlockManager = new PendingBlockManager(network);
        this.electionManager = new ElectionManager(network);
        this.proposalManager = new ProposalManager(network);
        this.validatorSelector = new ValidatorSelector(network);
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        // Initialize recent container history
        await this.validatorSelector.initialize();
        await this.proposalManager.initialize();

        this.initialized = true;
    }

    async proposeBlock(block, confirmationCallback = null) {
        this.network.node.log(`Proposing new block with hash: ${block.hash}`);
        const added = await this.pendingBlockManager.addBlock(block, confirmationCallback);
        if (added) {
            this.network.node.log(`Block added to pending and propagated: ${block.hash}`);
            this.pendingBlockManager.blockBroadcaster.broadcastBlock(block);
            this.proposalManager.process();
        } else {
            this.network.node.warn(`Failed to add block to pending: ${block.hash}`);
        }
        return added;
    }

    async proposalConfirmed(proposal) {
        const container = proposal.container;
        const result = await this.containerProcessor.addContainer(container);
        
        if (result.state !== 'CONTAINER_ADDED') {
            this.network.node.error(`Failed to add container ${container.hash}: ${result.state} ${JSON.stringify(result)}`);
            return;
        }

        // Cleanup any related state
        await this.pendingBlockManager.removeConfirmedBlocks(
            proposal.container.blocks.map(b => b.hash)
        );

        // Update confirmed active validators
        await this.validatorSelector.onNewContainer();

        // Clean up state
        this.proposalManager.removeProposal(proposal.hash);
        
        // Clean up confirmed blocks and trigger callbacks
        const blockHashes = container.blocks.map(b => b.hash);
        this.pendingBlockManager.removeConfirmedBlocks(blockHashes);

        // Broadcast confirmations
        for (const block of container.blocks) {
            this.network.node.broadcaster.broadcastBlockConfirmation(block);
        }
        this.network.node.broadcaster.broadcastContainerConfirmation(container);

        // Process any early proposals waiting for this container
        const earlyProposalProcessed = await this.proposalManager.processEarlyProposals(container.hash);
        if (!earlyProposalProcessed)
            this.proposalManager.process();

        await this.proposalManager.process();
    }
}

module.exports = DPoSConsensus;