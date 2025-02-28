class ElectionMonitor {
    constructor(network) {
        this.network = network;
        this.metrics = new Map();
        this.healthChecks = new Map();
        this.lastUpdate = Date.now();
        
        this.intervalUpdate = setInterval(() => this.updateMetrics(), 5000);
    }

    Stop() {
        clearInterval(this.intervalUpdate);
    }

    updateMetrics() {
        const now = Date.now();
        const electionManager = this.network.consensus.electionManager;
        
        // Collect metrics for active elections
        for (const [electionId, election] of electionManager.activeElections) {
            const metrics = {
                age: now - election.startTime,
                voteCount: election.votes.size,
                consensusProgress: election.getConsensusProgress(),
                voteDistribution: election.getVoteDistribution(),
                healthStatus: this.checkElectionHealth(election),
                networkParticipation: this.calculateNetworkParticipation(election),
                timing: {
                    averageVoteInterval: this.calculateAverageVoteInterval(election),
                    timeSinceLastVote: now - election.metrics.lastVoteTime
                }
            };
            
            this.metrics.set(electionId, metrics);
        }

        this.lastUpdate = now;
    }

    checkElectionHealth(election) {
        const now = Date.now();
        const status = {
            isHealthy: true,
            issues: []
        };

        // Check vote frequency
        const timeSinceLastVote = now - election.metrics.lastVoteTime;
        if (timeSinceLastVote > 30000) {
            status.isHealthy = false;
            status.issues.push('Low vote activity');
        }

        // Check consensus progress
        const progress = election.getConsensusProgress();
        if (election.age > 15000 && progress.progress < 0.3) {
            status.isHealthy = false;
            status.issues.push('Slow consensus building');
        }

        return status;
    }

    calculateNetworkParticipation(election) {
        const totalValidators = this.network.consensus.validatorSelector.getActiveValidators().length;
        const participatingValidators = election.votes.size;
        
        return {
            percentage: (participatingValidators / totalValidators) * 100,
            participating: participatingValidators,
            total: totalValidators
        };
    }

    getMetrics() {
        return {
            elections: Object.fromEntries(this.metrics),
            lastUpdate: this.lastUpdate,
            systemHealth: this.getSystemHealth()
        };
    }

    getSystemHealth() {
        const activeElections = this.network.consensus.electionManager.activeElections.size;
        const unhealthyElections = Array.from(this.metrics.values())
            .filter(m => !m.healthStatus.isHealthy).length;

        return {
            status: unhealthyElections === 0 ? 'healthy' : 'degraded',
            activeElections,
            unhealthyElections,
            lastUpdate: this.lastUpdate
        };
    }

    calculateAverageVoteInterval(election) {
        const timestamps = Array.from(election.voteTimestamps.values()).sort();
        if (timestamps.length < 2) return 0;

        let totalInterval = 0;
        for (let i = 1; i < timestamps.length; i++) {
            totalInterval += timestamps[i] - timestamps[i-1];
        }

        return totalInterval / (timestamps.length - 1);
    }
}

module.exports = ElectionMonitor; 