const EventEmitter = require('events');
const Decimal = require('decimal.js');
const EarlyVotes = require('./earlyvotes.js');
const Election = require('./election.js');
const ElectionValidator = require('./electionvalidator.js');
const ElectionBroadcaster = require('./electionbroadcaster.js');
const ElectionMonitor = require('./electionmonitor.js');
const Signer = require('../../../utils/signer.js');
const Hasher = require('../../../utils/hasher.js');
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
        this.voteLock = Promise.resolve(); // Add a promise-based lock
        this.processingVotes = new Set(); // Track votes being processed
        
        this.intervalCheck = setInterval(async () => {
            try {
                this.earlyVotes.cleanup();
                this.cleanupCompletedElections();
                this.cleanupExpiredElections();
            } catch (err) {
                this.network.node.error('Election cleanup error:', err);
            }
        }, 30000);

        this.intervalHealthCheck = setInterval(async () => {
            try {
                for (const [electionId, election] of this.activeElections) {
                    await this.checkElectionHealth(electionId);
                }
            } catch (err) {
                this.network.node.error('Election health check error:', err);
            }
        }, 10000);
    }
    Stop() {
        clearInterval(this.intervalCheck);
        clearInterval(this.intervalHealthCheck);
        this.monitor.Stop();
        this.validator.Stop();
    }

    async startLocalElection(type, category, electionId, initialCandidateId, metadata = {}) {
        this.validator.validateElectionParameters(type, category, metadata);
        
        let election = this.activeElections.get(electionId);
        if (!election) {
            election = new Election(type, category, electionId, metadata);
            this.activeElections.set(electionId, election);
            
            const timeoutId = setTimeout(() => this.finalizeElection(electionId), this.electionTimeout);
            this.electionTimeouts.set(electionId, timeoutId);

            await this.processEarlyVotes(election);
        }
        
        // If we are a validator, we can create and broadcast our vote.
        if (this.validator.amIValidator()) {
            const ownVote = await this.createVote(electionId, initialCandidateId, election, metadata);
            this.ownVotes.set(electionId, ownVote);
            await this.processVote(electionId, ownVote.voterId, ownVote.candidateId, ownVote.signature, ownVote.metadata);
            await this.broadcaster.broadcastVote(electionId, ownVote);
        }

        return electionId;
    }

    async processEarlyVotes(election) {
        const earlyVotes = this.earlyVotes.getAndClear(election.id);
        for (const [voterId, vote] of earlyVotes) {
            await this.processVote(election.id, voterId, vote.candidateId, vote.signature, vote.metadata);
        }
    }

    async processVote(electionId, voterId, candidateId, signature, metadata) {
        const start = performance.now();
        try {
            let election = this.activeElections.get(electionId);
            
            if (!election) {
                if (this.earlyVotes.has(electionId, voterId)) return false;
                this.earlyVotes.add(electionId, voterId, { candidateId, signature, metadata });
                return false;
            }

            if (!(await this.addVote(election, voterId, candidateId, signature, metadata))) {
                return false;
            }

            election.updateVoteDistribution(candidateId);

            if (this.validator.hasConsensus(election)) {
                this.finalizeElection(electionId);
            }

            return true;
        } catch (err) {
            this.network.node.error('Vote processing error:', err);
            return false;
        }
    }

    async addVote(election, voterId, candidateId, signature, metadata) {
        const validation = await this.validator.validateVote(election, voterId, candidateId, signature, metadata);

        if (!validation.isValid) {
            this.network.node.warn(`Invalid vote from ${voterId}: ${validation.reason}`);
            return false;
        }

        const weight = this.network.ledger.getVoteWeight(voterId);
        election.addVote(voterId, { 
            candidateId, 
            signature, 
            timestamp: Date.now(), 
            weight, 
            metadata 
        });
        
        this.network.node.debug(`Vote processed for election ${election.id} from voter (node) ${voterId}`);
        return true;
    }

    finalizeElection(electionId) {
        const start = performance.now();
        const election = this.activeElections.get(electionId);
        if (!election || !election.isActive()) return;

        if (election.status === 'finalizing') return;
        election.status = 'finalizing';

        try {
            const result = this.calculateWinner(election);
            this.completeElection(election, result);
            
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

    completeElection(election, { winner, voteWeights, totalWeight }) {
        election.complete(winner, voteWeights, totalWeight);
        
        const preferredCandidateId = this.ownVotes.get(election.id)?.candidateId || null;
        this.confirmedElections.set(election.id, election);
        this.activeElections.delete(election.id);
        this.ownVotes.delete(election.id);
        
        //setImmediate(() => {
            this.emit('election:completed', { 
                electionId: election.id, 
                type: election.type, 
                category: election.category, 
                winner,
                preferredCandidateId
            });
            
            this.broadcaster.cleanupElection(election.id);
            //this.network.node.debug(`Election metrics for ${election.id}:`, election.getMetrics());
        //});
    }

    calculateWinner(election) {
        const voteWeights = new Map();
        const totalWeight = this.network.ledger.getTotalVoteWeight();

        for (const [voterId, vote] of election.getVotes()) {
            const weight = this.network.ledger.getVoteWeight(voterId);
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
    getVotesForElection(electionId) {
        const collectedVotes = [];

        const election = this.confirmedElections.get(electionId);
        if (election) {
            for (const [voterId, vote] of election.votes) {
                collectedVotes[voterId] = vote;
            }
        }

        const earlyVotes = this.earlyVotes.get(electionId);
        if (earlyVotes) {
            for (const [voterId, vote] of earlyVotes) {
                collectedVotes[voterId] = vote;
            }
        }

        const activeElection = this.activeElections.get(electionId);
        if (activeElection) {
            for (const [voterId, vote] of activeElection.getVotes()) {
                collectedVotes[voterId] = vote;
            }
        }

        return collectedVotes;
    }

    async handleVote(vote, fromNodeId) {
        /*const release = await this.acquireVoteLock();
        try {*/
        // Quick check for duplicate votes
        const voteHash = await Hasher.hashText(JSON.stringify(vote));
        if (this.processingVotes.has(voteHash)) {
            this.network.node.debug(`Ignoring vote for election ${vote.electionId} from voter (node): ${vote.voterId}, already processed`);
            return;
        }
        this.processingVotes.add(voteHash);

        try{

            if (this.broadcaster.hasReceivedVote(vote.electionId, vote.voterId, fromNodeId)) {
                return;
            }
            await this.broadcaster.voteBroadcaster.handleNewVote(vote, fromNodeId);
            await this.broadcaster.broadcastVote(vote.electionId, vote);

            this.broadcaster.trackReceivedVote(vote.electionId, vote, fromNodeId);

            this.processVote(
                vote.electionId, 
                vote.voterId, 
                vote.candidateId, 
                vote.signature,
                vote.metadata
            );
        } catch (err) {
            this.network.node.error('Vote handling error:', err);
        }
    }

    async acquireVoteLock() {
        let release;
        const newLock = new Promise(resolve => {
            release = resolve;
        });

        const oldLock = this.voteLock;
        this.voteLock = newLock;
        await oldLock;

        return release;
    }

    /**
     * Clean up completed elections older than maxCompletedElectionAge
     */
    cleanupCompletedElections() {
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
    cleanupExpiredElections() {
        const now = Date.now();
        let cleanupCount = 0;

        for (const [electionId, election] of this.activeElections) {
            if (now - election.startTime > this.electionTimeout) {
                this.network.node.warn(`Election ${electionId} expired without consensus`);
                this.finalizeElection(electionId);
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
        const connectedValidators = this.network.consensus.validatorSelector.getActiveValidators();
        const votedValidators = new Set(election.getVoterIds());
        
        const missingValidators = connectedValidators.filter(v => !votedValidators.has(v));
        
        if (missingValidators.length > 0) {
            this.requestMissingVotes(election.id, missingValidators);
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
            await this.broadcaster.broadcastVote(election.id, ownVote);
        }

        this.emit('election:partition-warning', {
            electionId: election.id,
            participation: this.monitor.calculateNetworkParticipation(election),
            connectedPeers: this.network.node.peers.peerManager.connectedNodes.size
        });
    }

    requestMissingVotes(electionId, validators) {
        const message = {
            type: 'election:request-votes',
            electionId
        };

        for (const validatorId of validators) {
            try {
                this.network.node.sendToPeer(validatorId, message);
            } catch (err) {
                this.network.node.warn(`Failed to request votes from ${validatorId}:`, err);
            }
        }
    }

    async handleSlowConsensus(election) {
        const progress = election.getConsensusProgress();
        
        if (!this.ownVotes.has(election.id) && this.validator.amIValidator()) {
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

    async createVote(electionId, candidateId, election, metadata) {
        const message = election.metadata.messageFormat === 'candidateOnly' 
            ? candidateId 
            : `${electionId}:${candidateId}`;
        
        let signature = await Signer.signMessage(message, this.network.node.nodePrivateKey);

        return {
            electionId,
            voterId: this.network.node.nodeId,
            candidateId,
            signature,
            metadata: metadata
        };
    }
}

module.exports = ElectionManager; 