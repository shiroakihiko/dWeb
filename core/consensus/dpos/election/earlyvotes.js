class EarlyVotes {
    constructor(timeout = 600000) {
        this.votes = new Map();
        this.timeout = timeout;
        this.metrics = {
            totalProcessed: 0,
            totalExpired: 0,
            lastCleanup: null
        };
    }

    add(electionId, voterId, { candidateId, signature, metadata }) {
        if (!electionId || !voterId || !candidateId || !signature) {
            throw new Error('Missing required vote data');
        }

        if (!this.votes.has(electionId)) {
            this.votes.set(electionId, new Map());
        }

        const vote = {
            candidateId,
            signature,
            metadata,
            timestamp: Date.now()
        };

        this.votes.get(electionId).set(voterId, vote);
        this.metrics.totalProcessed++;
        return vote;
    }

    has(electionId, voterId) {
        return this.votes.has(electionId) && 
               this.votes.get(electionId).has(voterId);
    }

    isValid(vote) {
        return Date.now() - vote.timestamp <= this.timeout;
    }

    getAndClear(electionId) {
        const votes = this.votes.get(electionId);
        if (!votes) return new Map();

        const validVotes = new Map();
        const now = Date.now();

        for (const [voterId, vote] of votes) {
            if (now - vote.timestamp <= this.timeout) {
                validVotes.set(voterId, vote);
            } else {
                this.metrics.totalExpired++;
            }
        }

        this.votes.delete(electionId);
        return validVotes;
    }

    get(electionId) {
        return this.votes.get(electionId);
    }

    cleanup() {
        const now = Date.now();
        let expiredCount = 0;

        for (const [electionId, votes] of this.votes) {
            for (const [voterId, vote] of votes) {
                if (now - vote.timestamp > this.timeout) {
                    votes.delete(voterId);
                    expiredCount++;
                }
            }
            if (votes.size === 0) {
                this.votes.delete(electionId);
            }
        }

        this.metrics.totalExpired += expiredCount;
        this.metrics.lastCleanup = now;
    }

    getMetrics() {
        return {
            totalElections: this.votes.size,
            totalProcessed: this.metrics.totalProcessed,
            totalExpired: this.metrics.totalExpired,
            lastCleanup: this.metrics.lastCleanup,
            electionDetails: Array.from(this.votes.entries()).map(([electionId, votes]) => ({
                electionId,
                voteCount: votes.size,
                oldestVote: Math.min(...Array.from(votes.values()).map(v => v.timestamp)),
                newestVote: Math.max(...Array.from(votes.values()).map(v => v.timestamp))
            }))
        };
    }
} 

module.exports = EarlyVotes;