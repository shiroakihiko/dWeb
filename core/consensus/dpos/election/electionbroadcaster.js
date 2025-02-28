const VoteBroadcaster = require('./votebroadcaster');

class ElectionBroadcaster {
    constructor(network) {
        this.network = network;
        this.receivedVotes = new Map(); // electionId -> Map<voterId, Set<nodeId>>
        this.sentVotes = new Map(); // electionId -> Map<voterId, Set<nodeId>>
        this.metrics = {
            totalBroadcastedVotes: 0,
            totalReceivedVotes: 0,
            lastCleanup: null
        };
        this.voteBroadcaster = new VoteBroadcaster(network);
    }
    
    /**
     * Broadcast vote to peers who haven't received it
     */
    async broadcastVote(electionId, vote, excludeNodes = new Set()) {
        const start = performance.now();
        const metrics = {
            setup: 0,
            sending: 0,
            peerCount: 0
        };

        const setupStart = performance.now();
        if (!this.sentVotes.has(electionId)) {
            this.sentVotes.set(electionId, new Map());
        }
        
        const voterTracking = this.sentVotes.get(electionId);
        if (!voterTracking.has(vote.voterId)) {
            voterTracking.set(vote.voterId, new Set());
        }

        const sentTo = voterTracking.get(vote.voterId);
        const peers = this.network.node.peers.peerManager.connectedNodes;
        const peersToBroadcastTo = Array.from(peers.keys()).filter(nodeId => 
            !sentTo.has(nodeId) && !excludeNodes.has(nodeId)
        );

        metrics.setup = performance.now() - setupStart;
        metrics.peerCount = peersToBroadcastTo.length;

        const sendStart = performance.now();
        for (const nodeId of peersToBroadcastTo) {
            try {
                const success = await this.voteBroadcaster.propagateVote(nodeId, vote);
                if(success) {
                    sentTo.add(nodeId);
                    this.metrics.totalBroadcastedVotes++;
                }
            } catch (err) {
                this.network.node.error(`Failed to broadcast vote to ${nodeId}:`, err);
            }
        }

        metrics.sending = performance.now() - sendStart;

        this.network.node.debug('Vote broadcast metrics:', {
            total: performance.now() - start,
            ...metrics
        });
    }
    /**
     * Track received vote to prevent duplicate broadcasts
     */
    trackReceivedVote(electionId, vote, fromNodeId) {
        if (!this.receivedVotes.has(electionId)) {
            this.receivedVotes.set(electionId, new Map());
        }

        const voterTracking = this.receivedVotes.get(electionId);
        if (!voterTracking.has(vote.voterId)) {
            voterTracking.set(vote.voterId, new Set());
        }

        this.voteBroadcaster.handleNewVote(vote, fromNodeId);

        voterTracking.get(vote.voterId).add(fromNodeId);
        this.metrics.totalReceivedVotes++;
    }

    /**
     * Check if we've received this vote from this node
     */
    hasReceivedVote(electionId, voterId, fromNodeId) {
        return this.receivedVotes.get(electionId)?.get(voterId)?.has(fromNodeId) || false;
    }

    /**
     * Check if we've sent this vote to this node
     */
    hasSentVote(electionId, voterId, toNodeId) {
        return this.sentVotes.get(electionId)?.get(voterId)?.has(toNodeId) || false;
    }

    /**
     * Clean up tracking for completed election
     */
    cleanupElection(electionId) {
        try {
            // Clean up all tracking maps
            this.receivedVotes.delete(electionId);
            this.sentVotes.delete(electionId);
            
            // Log cleanup for monitoring
            this.network.node.debug(`Cleaned up tracking for election ${electionId}`);
        } catch (err) {
            this.network.node.error(`Error cleaning up election ${electionId}:`, err);
        }
    }

    /**
     * Clean up old elections
     */
    cleanup(maxAge = 3600000) {
        const now = Date.now();
        const cutoff = now - maxAge;
        let cleanupCount = 0;

        try {
            for (const [electionId, sentTo] of this.sentVotes) {
                const oldestBroadcast = Math.min(...Array.from(sentTo.values()));
                if (oldestBroadcast < cutoff) {
                    this.cleanupElection(electionId);
                    cleanupCount++;
                }
            }

            if (cleanupCount > 0) {
                this.network.node.debug(`Cleaned up ${cleanupCount} old elections`);
            }
            
            this.metrics.lastCleanup = now;
        } catch (err) {
            this.network.node.error('Election cleanup error:', err);
        }
    }

    getMetrics() {
        return {
            ...this.metrics,
            activeElections: this.sentVotes.size,
            trackedVotes: {
                received: Array.from(this.receivedVotes.entries()).reduce(
                    (acc, [electionId, voters]) => acc + Array.from(voters.values())
                        .reduce((sum, nodes) => sum + nodes.size, 0), 0
                ),
                sent: Array.from(this.sentVotes.entries()).reduce(
                    (acc, [electionId, voters]) => acc + Array.from(voters.values())
                        .reduce((sum, nodes) => sum + nodes.size, 0), 0
                )
            }
        };
    }
}

module.exports = ElectionBroadcaster; 