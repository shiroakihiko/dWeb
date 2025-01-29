const EventEmitter = require('events');
const Decimal = require('decimal.js');
const EarlyVotes = require('./earlyvotes.js');
const Election = require('./election.js');
const ElectionValidator = require('./electionvalidator.js');
const ElectionBroadcaster = require('./electionbroadcaster.js');
const ElectionMonitor = require('./electionmonitor.js');
const Signer = require('../../../utils/signer.js');

class ElectionManager extends EventEmitter {
    constructor(network) {
        super();
        this.network = network;
        this.validator = new ElectionValidator(network);
        this.broadcaster = new ElectionBroadcaster(network);
        this.monitor = new ElectionMonitor(network);
        this.activeElections = new Map();
        this.confirmedElections = new Map();
        this.ownVotes = new Map();
        this.earlyVotes = new EarlyVotes(600000);
        this.electionTimeout = 30000;
        this.maxCompletedElectionAge = 86400000;
        this.electionTimeouts = new Map();
        
        setInterval(async () => {
            try {
                this.earlyVotes.cleanup();
                await this.cleanupCompletedElections();
                await this.cleanupExpiredElections();
            } catch (err) {
                this.network.node.error('Election cleanup error:', err);
            }
        }, 30000);

        setInterval(async () => {
            try {
                for (const [electionId, election] of this.activeElections) {
                    await this.checkElectionHealth(electionId);
                }
            } catch (err) {
                this.network.node.error('Election health check error:', err);
            }
        }, 10000);
    }

    async startLocalElection(type, category, electionId, initialCandidateId, metadata = {}) {
        await this.validator.validateElectionParameters(type, category, metadata);
        
        let election = this.activeElections.get(electionId);
        if (!election) {
            election = new Election(type, category, electionId, metadata);
            this.activeElections.set(electionId, election);
            
            const timeoutId = setTimeout(() => this.finalizeElection(electionId), this.electionTimeout);
            this.electionTimeouts.set(electionId, timeoutId);

            await this.processEarlyVotes(election);
        }
        
        if (await this.validator.amIValidator()) {
            const ownVote = await this.createVote(electionId, initialCandidateId, election);
            this.ownVotes.set(electionId, ownVote);
            await this.processVote(electionId, ownVote.voterId, ownVote.candidateId, ownVote.signature);
            this.broadcaster.broadcastVote(electionId, ownVote);
        }

        return electionId;
    }

    async processEarlyVotes(election) {
        const earlyVotes = this.earlyVotes.getAndClear(election.id);
        for (const [voterId, vote] of earlyVotes) {
            await this.processVote(election.id, voterId, vote.candidateId, vote.signature);
        }
    }

    async processVote(electionId, voterId, candidateId, signature) {
        try {
            let election = this.activeElections.get(electionId);
            
            if (!election) {
                if (this.earlyVotes.has(electionId, voterId)) return false;
                this.earlyVotes.add(electionId, voterId, { candidateId, signature });
                return false;
            }

            if (!await this.addVote(election, voterId, candidateId, signature)) {
                return false;
            }

            election.updateVoteDistribution(candidateId);

            if (await this.validator.hasConsensus(election)) {
                await this.finalizeElection(electionId);
            }

            return true;
        } catch (err) {
            this.network.node.error('Vote processing error:', err);
            return false;
        }
    }

    async addVote(election, voterId, candidateId, signature) {
        const validation = await this.validator.validateVote(election, voterId, candidateId, signature);

        if (!validation.isValid) {
            this.network.node.warn(`Invalid vote from ${voterId}: ${validation.reason}`);
            return false;
        }

        const weight = await this.network.ledger.getVoteWeight(voterId);
        await election.addVote(voterId, { candidateId, signature, timestamp: Date.now(), weight });
        this.network.node.debug(`Vote processed for election ${election.id} from ${voterId}`);
        return true;
    }

    async finalizeElection(electionId) {
        const election = this.activeElections.get(electionId);
        if (!election || !election.isActive()) return;

        if (election.status === 'finalizing') return;
        election.status = 'finalizing';

        try {
            const result = await this.calculateWinner(election);
            await this.completeElection(election, result);
            
            const timeoutId = this.electionTimeouts.get(electionId);
            if (timeoutId) {
                clearTimeout(timeoutId);
                this.electionTimeouts.delete(electionId);
            }
        } catch (err) {
            this.network.node.error(`Election finalization error for ${electionId}:`, err);
            election.status = 'active';
        }
    }

    async completeElection(election, { winner, voteWeights, totalWeight }) {
        election.complete(winner, voteWeights, totalWeight);
        this.confirmedElections.set(election.id, election);
        this.activeElections.delete(election.id);
        this.ownVotes.delete(election.id);
        
        this.network.node.log(`Election ${election.id} completed. Winner: ${winner || 'No winner'}`);
        this.emit('election:completed', { 
            electionId: election.id, 
            type: election.type, 
            category: election.category, 
            winner 
        });
        
        this.broadcaster.cleanupElection(election.id);
        this.network.node.debug(`Election metrics for ${election.id}:`, election.getMetrics());
    }

    async calculateWinner(election) {
        const voteWeights = new Map();
        const totalWeight = await this.network.ledger.getTotalVoteWeight();

        for (const [voterId, vote] of election.getVotes()) {
            const weight = await this.network.ledger.getVoteWeight(voterId);
            if (!weight) continue;

            const currentWeight = voteWeights.get(vote.candidateId) || new Decimal(0);
            voteWeights.set(vote.candidateId, currentWeight.plus(new Decimal(weight)));
        }

        let winner = null;
        for (const candidateId of election.getCandidates()) {
            const weight = voteWeights.get(candidateId) || new Decimal(0);
            if (weight.div(totalWeight).gte(this.validator.quorumThreshold)) {
                winner = candidateId;
                break;
            }
        }

        return { winner, voteWeights, totalWeight };
    }

    // Get all votes, early, confirmed, and presently in progress
    getVoteSignatures(electionId) {
        const collectedVotes = [];

        const election = this.confirmedElections.get(electionId);
        if (election) {
            for (const [voterId, vote] of election.votes) {
                collectedVotes[voterId] = vote.signature;
            }
        }

        const earlyVotes = this.earlyVotes.get(electionId);
        if (earlyVotes) {
            for (const [voterId, vote] of earlyVotes) {
                collectedVotes[voterId] = vote.signature;
            }
        }

        const activeElection = this.activeElections.get(electionId);
        if (activeElection) {
            for (const [voterId, vote] of activeElection.getVotes()) {
                collectedVotes[voterId] = vote.signature;
            }
        }

        return collectedVotes;
    }

    async handleVote(vote, fromNodeId) {
        try {
            if (this.broadcaster.hasReceivedVote(vote.electionId, vote.voterId, fromNodeId)) {
                return;
            }
            this.broadcaster.broadcastVote(vote.electionId, vote);

            this.broadcaster.trackReceivedVote(vote.electionId, vote, fromNodeId);

            await this.processVote(
                vote.electionId, 
                vote.voterId, 
                vote.candidateId, 
                vote.signature
            );
        } catch (err) {
            this.network.node.error('Vote handling error:', err);
        }
    }

    /**
     * Clean up completed elections older than maxCompletedElectionAge
     */
    async cleanupCompletedElections() {
        const now = Date.now();
        let cleanupCount = 0;

        for (const [electionId, election] of this.confirmedElections) {
            if (now - election.completedAt > this.maxCompletedElectionAge) {
                this.confirmedElections.delete(electionId);
                cleanupCount++;
            }
        }

        if (cleanupCount > 0) {
            this.network.node.debug(`Cleaned up ${cleanupCount} completed elections`);
        }
    }

    /**
     * Clean up expired active elections
     */
    async cleanupExpiredElections() {
        const now = Date.now();
        let cleanupCount = 0;

        for (const [electionId, election] of this.activeElections) {
            if (now - election.startTime > this.electionTimeout) {
                this.network.node.warn(`Election ${electionId} expired without consensus`);
                await this.finalizeElection(electionId);
                cleanupCount++;
            }
        }

        if (cleanupCount > 0) {
            this.network.node.debug(`Cleaned up ${cleanupCount} expired elections`);
        }
    }

    getMetrics() {
        const now = Date.now();
        return {
            activeElections: {
                count: this.activeElections.size,
                details: Array.from(this.activeElections.entries()).map(([id, election]) => ({
                    id,
                    type: election.type,
                    category: election.category,
                    age: now - election.startTime,
                    ...election.getMetrics()
                }))
            },
            confirmedElections: {
                count: this.confirmedElections.size,
                details: Array.from(this.confirmedElections.entries()).map(([id, election]) => ({
                    id,
                    type: election.type,
                    category: election.category,
                    winner: election.winner,
                    voteCount: election.votes.size,
                    completedAt: election.completedAt,
                    age: now - election.completedAt,
                    totalDuration: election.completedAt - election.startTime,
                    voteWeights: election.voteWeights,
                    voters: Array.from(election.votes.entries()).map(([voterId, vote]) => ({
                        voterId,
                        candidateId: vote.candidateId,
                        timestamp: vote.timestamp,
                        weight: vote.weight.toString()
                    }))
                }))
            },
            earlyVotes: this.earlyVotes.getMetrics(),
            ownVotes: {
                count: this.ownVotes.size,
                categories: Array.from(this.ownVotes.values()).reduce((acc, vote) => {
                    const election = this.activeElections.get(vote.electionId) || 
                                   this.confirmedElections.get(vote.electionId);
                    if (election) {
                        acc[election.category] = (acc[election.category] || 0) + 1;
                    }
                    return acc;
                }, {})
            }
        };
    }

    createElectionId(type, category, uniqueId) {
        return `${type}:${category}:${uniqueId}`;
    }

    async checkElectionHealth(electionId) {
        const election = this.activeElections.get(electionId);
        if (!election) return null;

        const health = this.monitor.checkElectionHealth(election);
        
        if (!health.isHealthy) {
            if (health.issues.includes('Low vote activity')) {
                await this.handleLowVoteActivity(election);
            }
            if (health.issues.includes('Slow consensus building')) {
                await this.handleSlowConsensus(election);
            }
        }

        return health;
    }

    async handleLowVoteActivity(election) {
        const connectedValidators = await this.network.consensus.validatorSelector.getActiveValidators();
        const votedValidators = new Set(election.getVoterIds());
        
        const missingValidators = connectedValidators.filter(v => !votedValidators.has(v));
        
        if (missingValidators.length > 0) {
            await this.requestMissingVotes(election.id, missingValidators);
        }

        const participation = this.monitor.calculateNetworkParticipation(election);
        if (participation.percentage < 50) {
            await this.handlePotentialPartition(election);
        }
    }

    async handlePotentialPartition(election) {
        this.network.node.warn(`Potential network partition detected for election ${election.id}`);
        
        //await this.network.node.expandPeerConnections();
        
        const ownVote = this.ownVotes.get(election.id);
        if (ownVote) {
            this.broadcaster.broadcastVote(election.id, ownVote);
        }

        this.emit('election:partition-warning', {
            electionId: election.id,
            participation: this.monitor.calculateNetworkParticipation(election),
            connectedPeers: this.network.node.getPeerCount()
        });
    }

    async requestMissingVotes(electionId, validators) {
        const message = {
            type: 'election:request-votes',
            electionId
        };

        for (const validatorId of validators) {
            try {
                await this.network.node.sendToPeer(validatorId, message);
            } catch (err) {
                this.network.node.warn(`Failed to request votes from ${validatorId}:`, err);
            }
        }
    }

    async handleSlowConsensus(election) {
        const progress = election.getConsensusProgress();
        
        if (!this.ownVotes.has(election.id) && await this.validator.amIValidator()) {
            const candidates = election.getCandidates();
            if (candidates.length > 0) {
                const bestCandidate = Array.from(election.weightCache.entries())
                    .reduce((a, b) => a[1].gt(b[1]) ? a : b)[0];
                
                await this.startLocalElection(
                    election.type,
                    election.category,
                    election.id,
                    bestCandidate,
                    election.metadata
                );
            }
        }
    }

    async createVote(electionId, candidateId, election) {
        const message = election.metadata.messageFormat === 'candidateOnly' 
            ? candidateId 
            : `${electionId}:${candidateId}`;
        
        this.signer = new Signer(this.network.node.nodePrivateKey);
        let signature = this.signer.signMessage(message);

        return {
            electionId,
            voterId: this.network.node.nodeId,
            candidateId,
            signature
        };
    }
}

module.exports = ElectionManager; 