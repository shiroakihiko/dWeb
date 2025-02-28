const Signer = require('../../../utils/signer');

class ProposalBroadcaster {
    constructor(network) {
        this.network = network;
        this.peersHoldingProposal = new Map(); // nodeId -> Set of proposal hashes
        this.locallyCreatedProposals = new Set(); // Set of proposal hashes we created
    }

    // Propagate a proposal to peers that haven't seen it
    async propagateProposal(proposal, createdLocally = false) {
        // Track locally created proposals to prevent re-broadcasting
        if(createdLocally) {
            if(this.locallyCreatedProposals.has(proposal.hash)) {
                this.network.node.verbose(`Skipping re-broadcast of locally created proposal ${proposal.hash}`);
                return;
            }
            this.locallyCreatedProposals.add(proposal.hash);

            // Add peers with signature that will receive the proposal
            const propogatedToPeers = [];
            for (const peer of this.network.node.peers.peerManager.connectedNodes.keys()) {
                propogatedToPeers.push(peer);
            }
            proposal.propogatedToPeers = propogatedToPeers;
            proposal.propogatedToPeersSignature = await Signer.signMessage(JSON.stringify(propogatedToPeers), this.network.node.nodePrivateKey);
        }

        const connectedPeers = this.network.node.peers.peerManager.connectedNodes;
        for (const [nodeId, socket] of connectedPeers) {
            // Proposal creator does not need to receive its own proposal
            if(proposal.creator === nodeId) {
                continue;
            }
            // No need to send to ourselves in case multiple nodes are running
            if(nodeId === this.network.node.nodeId) {
                continue;
            }

            // Skip if peer already has this proposal
            if(this.peersHoldingProposal.has(nodeId) && 
               this.peersHoldingProposal.get(nodeId).has(proposal.hash)) {
                continue;
            }

            this.addPeerForProposal(proposal.hash, nodeId);

            this.network.node.sendMessage(socket, {
                type: 'blockProposal',
                proposal
            });
            this.network.node.info(`Proposal ${proposal.hash} broadcasted to peer ${nodeId}`);
        }
        
        this.network.node.info(`Block proposal ${proposal.hash} broadcasted to peers`);
    }

    // Handle receiving a new proposal
    async handleNewProposal(proposal, sourceNodeId) {
        // Skip if we created this proposal
        if(this.locallyCreatedProposals.has(proposal.hash)) {
            this.network.node.verbose(`Ignoring our own proposal ${proposal.hash} from peer ${sourceNodeId}`);
            return;
        }

        // Add peers that already have the proposal according to the creator
        const propogatedToPeers = proposal.propogatedToPeers;
        const propogatedToPeersSignature = proposal.propogatedToPeersSignature;
        if(propogatedToPeers && propogatedToPeersSignature) {
            if(!(await Signer.verifySignatureWithPublicKey(JSON.stringify(propogatedToPeers), propogatedToPeersSignature, proposal.creator))) {
                this.network.node.warn(`Creator signature for propogated peers is invalid for proposal ${proposal.hash}`);
                return;
            }
            for (const peer of propogatedToPeers) {
                this.addPeerForProposal(proposal.hash, peer);
            }
        }

        // Add the source node that sent us the proposal to the list of peers that have the proposal
        this.addPeerForProposal(proposal.hash, sourceNodeId);
        this.network.node.verbose(`Received proposal ${proposal.hash} from node ${sourceNodeId}`);
        this.network.consensus.proposalManager.onProposalReceived(proposal, sourceNodeId);
    }

    addPeerForProposal(proposalHash, nodeId) {
        if(!this.peersHoldingProposal.has(nodeId)) {
            this.peersHoldingProposal.set(nodeId, new Set());
        }
        this.peersHoldingProposal.get(nodeId).add(proposalHash);
    }

    // Clean up old proposals to prevent memory leaks
    cleanupOldProposals(proposalHash) {
        this.locallyCreatedProposals.delete(proposalHash);
        for(const peerSet of this.peersHoldingProposal.values()) {
            peerSet.delete(proposalHash);
        }
    }
}

module.exports = ProposalBroadcaster; 