const Signer = require('../../../utils/signer');
const Hasher = require('../../../utils/hasher');

class VoteBroadcaster {
    constructor(network) {
        this.network = network;
        this.peersHoldingVote = new Map(); // nodeId -> Set of vote hashes
        this.locallyCreatedVotes = new Set(); // Set of vote hashes we created
    }

    // Propagate a vote to peers that haven't seen it
    async propagateVote(nodeId, vote) {
        // Voter does not need to receive its own vote
        if(vote.voterId === nodeId) {
            return false;
        }

        const createdLocally = vote.voterId === this.network.node.nodeId;
        if(createdLocally) {
            // Add peers with signature that will receive the vote
            const propogatedToPeers = [];
            for (const peer of this.network.node.peers.peerManager.connectedNodes.keys()) {
                propogatedToPeers.push(peer);
            }
            vote.votesSentTo = propogatedToPeers;
            vote.votesSentToSignature = await Signer.signMessage(JSON.stringify(vote.votesSentTo), this.network.node.nodePrivateKey);
        }

        const voteHash = await Hasher.hashText(JSON.stringify(vote));

        // Skip if peer already has this vote
        if(this.peersHoldingVote.has(nodeId) && 
           this.peersHoldingVote.get(nodeId).has(voteHash)) {
            return false;
        }

        this.addVoteForPeer(voteHash, nodeId);

        //console.log(`Broadcasting vote for election ${vote.electionId} to ${nodeId}`);
        const socket = this.network.node.peers.peerManager.connectedNodes.get(nodeId);
        this.network.node.sendMessage(socket, {
            type: 'election:vote',
            vote
        });
        this.network.node.info(`Vote ${voteHash} from ${vote.voterId} for election ${vote.electionId} broadcasted to peer ${nodeId}`);

        return true;
    }

    // Handle receiving a new vote
    async handleNewVote(vote, sourceNodeId) {
        const voteHash = await Hasher.hashText(JSON.stringify(vote));
        // Skip if we created this vote
        if(vote.voterId === this.network.node.nodeId) {
            this.network.node.verbose(`Ignoring our own vote ${voteHash} from peer ${sourceNodeId}`);
            return;
        }

        // Add peers that already have the vote according to the creator
        const propogatedToPeers = vote.votesSentTo;
        const propogatedToPeersSignature = vote.votesSentToSignature;
        if(propogatedToPeersSignature) {
            if(!(await Signer.verifySignatureWithPublicKey(JSON.stringify(propogatedToPeers), propogatedToPeersSignature, vote.voterId)) ){
                this.network.node.warn(`Creator signature for propogated peers is invalid for vote ${voteHash}`);
                return;
            }
            for (const peer of propogatedToPeers) {
                this.addVoteForPeer(voteHash, peer);
            }
    
        }
        // Add the source node that sent us the vote to the list of peers that have the vote
        this.addVoteForPeer(voteHash, sourceNodeId);
        this.network.node.verbose(`Received vote ${voteHash} from node ${sourceNodeId}`);
    }

    addVoteForPeer(voteHash, nodeId) {
        if(!this.peersHoldingVote.has(nodeId)) {
            this.peersHoldingVote.set(nodeId, new Set());
        }
        this.peersHoldingVote.get(nodeId).add(voteHash);
    }

    // Clean up old votes to prevent memory leaks
    cleanupOldVotes(voteHash) {
        this.locallyCreatedVotes.delete(voteHash);
        for(const peerSet of this.peersHoldingVote.values()) {
            peerSet.delete(voteHash);
        }
    }
}

module.exports = VoteBroadcaster; 