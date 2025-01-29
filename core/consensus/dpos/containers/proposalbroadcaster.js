class ProposalBroadcaster {
    constructor(network) {
        this.network = network;
    }

    // Propagate a block to peers that haven't seen it
    async propagateProposal(proposal) {
        this.network.node.broadcaster.broadcastToPeers({
            type: 'containerProposal',
            proposal
        });
        this.network.node.info(`Container proposal ${proposal.hash} broadcasted to peers`);
    }

    // Handle receiving a new block
    async handleNewProposal(proposal, sourceNodeId) {
        this.network.node.verbose(`Received proposal ${proposal.hash} from node ${sourceNodeId}`);
        await this.network.consensus.proposalManager.onProposalReceived(proposal, sourceNodeId);
    }
}

module.exports = ProposalBroadcaster; 