const Decimal = require('decimal.js');

class Election {
    constructor(type, category, electionId, metadata = {}) {
        if (!['binary', 'selection'].includes(type)) {
            throw new Error(`Invalid election type: ${type}`);
        }
        
        this.type = type;
        this.category = category;
        this.id = electionId;
        this.metadata = metadata;
        this.votes = new Map();
        this.receivedCandidates = new Set(); // Track candidates we've seen valid votes for
        this.startTime = Date.now();
        this.status = 'active';
        this.winner = null;
        this.voteWeights = null;
        this.totalWeight = null;
        this.completedAt = null;
        this.voteDistribution = new Map(); // Track votes per candidate
        this.voteTimestamps = new Map(); // Track vote timing
        this.metrics = this.initializeMetrics();
        
        this.weightCache = new Map(); // candidateId -> current weight
        this.totalWeightCache = new Decimal(0);
        this.consensusProgress = 0;
    }

    initializeMetrics() {
        return {
            voteCount: 0,
            lastVoteTime: null,
            firstVoteTime: null,
            votingDuration: 0,
            voteDistribution: new Map()
        };
    }

    addVote(voterId, { candidateId, signature, timestamp, weight, metadata }) {
        if (this.votes.has(voterId)) {
            return false;
        }
        
        const vote = { candidateId, signature, timestamp, weight, metadata };
        this.votes.set(voterId, vote);
        this.receivedCandidates.add(candidateId);

        // Update weight cache
        const currentWeight = this.weightCache.get(candidateId) || new Decimal(0);
        this.weightCache.set(candidateId, currentWeight.plus(new Decimal(weight)));
        this.totalWeightCache = this.totalWeightCache.plus(new Decimal(weight));

        // Update consensus progress
        this.updateConsensusProgress();

        // Update metrics
        this.updateMetrics(vote);
        
        return true;
    }

    updateConsensusProgress() {
        const highestWeight = Math.max(...Array.from(this.weightCache.values())
            .map(w => w.toNumber()));
        this.consensusProgress = this.totalWeightCache.isZero() ? 0 :
            new Decimal(highestWeight).div(this.totalWeightCache).toNumber();
    }

    updateMetrics(vote) {
        this.metrics.voteCount = this.votes.size;
        this.metrics.lastVoteTime = vote.timestamp;
        this.metrics.firstVoteTime = this.metrics.firstVoteTime || vote.timestamp;
        this.metrics.votingDuration = vote.timestamp - this.startTime;
        
        // Update vote distribution
        const count = this.metrics.voteDistribution.get(vote.candidateId) || 0;
        this.metrics.voteDistribution.set(vote.candidateId, count + 1);
    }

    hasVote(voterId) {
        return this.votes.has(voterId);
    }

    getVoterIds() {
        return Array.from(this.votes.keys());
    }

    getVotes() {
        return this.votes;
    }

    isActive() {
        return this.status === 'active';
    }

    complete(winner, voteWeights, totalWeight) {
        this.status = 'completed';
        this.winner = winner;
        this.voteWeights = voteWeights;
        this.totalWeight = totalWeight;
        this.completedAt = Date.now();
        this.metrics.completionTime = this.completedAt;
        this.metrics.totalDuration = this.completedAt - this.startTime;
    }

    getMetrics() {
        return {
            ...this.metrics,
            age: Date.now() - this.startTime,
            status: this.status,
            voteCount: this.votes.size,
            hasWinner: !!this.winner,
            voteDistribution: Object.fromEntries(this.metrics.voteDistribution),
            voters: Array.from(this.votes.entries()).map(([voterId, vote]) => ({
                voterId,
                candidateId: vote.candidateId,
                timestamp: vote.timestamp,
                weight: vote.weight.toString()
            }))
        };
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            category: this.category,
            metadata: this.metadata
        };
    }

    getCandidates() {
        return Array.from(this.receivedCandidates);
    }

    updateVoteDistribution(candidateId) {
        const currentCount = this.voteDistribution.get(candidateId) || 0;
        this.voteDistribution.set(candidateId, currentCount + 1);
    }

    getVoteDistribution() {
        return Object.fromEntries(this.voteDistribution);
    }

    getVotingProgress() {
        return {
            totalVotes: this.votes.size,
            distribution: this.getVoteDistribution(),
            timing: {
                firstVote: Math.min(...this.voteTimestamps.values()),
                lastVote: Math.max(...this.voteTimestamps.values()),
                averageInterval: this.calculateAverageVoteInterval()
            }
        };
    }

    getConsensusProgress() {
        return {
            progress: this.consensusProgress,
            totalVotes: this.votes.size,
            weightDistribution: Object.fromEntries(this.weightCache),
            totalWeight: this.totalWeightCache.toString()
        };
    }
}

module.exports = Election;