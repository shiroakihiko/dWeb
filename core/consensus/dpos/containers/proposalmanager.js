const Decimal = require('decimal.js');
const Proposal = require('./proposal');
const ProposalBroadcaster = require('./proposalbroadcaster');

class ProposalManager {
    constructor(network) {
        this.network = network;
        this.proposalBroadcaster = new ProposalBroadcaster(network);
        this.proposalTimeout = 10000;
        this.pendingContainers = new Map(); // containerHash -> proposal
        // Initialize proposal processing queue
        this.proposalQueue = Promise.resolve(); // Instead of a lock to prevent race conditions, we use a queue to process proposals
        this.earlyProposals = new Map(); // previousContainerHash -> Map<proposalHash, {proposal, fromNodeId}>
        this.earlyProposalTimeout = 120000; // 120 seconds

        // Add metrics tracking
        this.metrics = {
            lastProcessingTime: 0,
            validationTime: 0,
            electionStartTime: 0,
            broadcastTime: 0,
            proposalCount: 0,
            lastProposalTimestamp: 0
        };
    }
    async initialize() {
        this.network.consensus.electionManager.on('election:completed', this.onElectionCompleted.bind(this));
        
        // Register vote validators only
        this.network.consensus.electionManager.validator.registerVoteValidator(
            'containerValidation',
            async (voterId, candidateId, metadata) => {
                return await this.validateContainerValidationVote(voterId, candidateId, metadata);
            }
        );

        this.network.consensus.electionManager.validator.registerVoteValidator(
            'nextContainer',
            async (voterId, candidateId, metadata) => {
                return await this.validateNextContainerVote(voterId, candidateId, metadata);
            }
        );
    }

    queueProposalProcessing(action) {
        this.proposalQueue = this.proposalQueue.then(async () => {
            try {
                return await action();
            } catch (err) {
                this.network.node.error('Proposal processing error:', err);
                return null;
            }
        });
        return this.proposalQueue;
    }

    //--------------------------------
    // Main Container Processing Flow
    //--------------------------------

    async process() {
        await this.startOwnProposal();
    }

    async startOwnProposal() {
        await this.queueProposalProcessing(async () => {
            const canCreate = await this.validateCreationRequirements();
            this.network.node.debug(`validateCreationRequirements result: ${canCreate}, pendingBlocks: ${this.network.consensus.pendingBlockManager.getPendingBlockCount()}`);
            if(!canCreate) return;
            
            await this.processProposal();
        });
    }

    async onProposalReceived(proposalData, fromNodeId) {
        await this.queueProposalProcessing(async () => {
            const lastContainerHash = await this.network.ledger.getLastContainerHash();
            
            // If proposal's previous hash is ahead of our current state
            if (proposalData.previousContainerHash !== lastContainerHash) {
                // Store as early proposal
                await this.storeEarlyProposal(proposalData, fromNodeId);
                return;
            }

            const validProposal = await this.processProposal(proposalData, fromNodeId);
            if(validProposal) {
                // Send received proposal to other peers now that we know it's valid and we could process it
                await this.proposalBroadcaster.propagateProposal(proposalData);
            }
        });
    }

    async processProposal(existingProposalData = null, nodeId = null) {
        const startTime = performance.now();
        let proposal;

        try {
            if (existingProposalData) {
                // Handle received proposal
                if(this.pendingContainers.has(existingProposalData.hash)) {
                    this.network.node.log(`Proposal ${existingProposalData.hash} already exists, skipping`);
                    return;
                }

                proposal = new Proposal(this.network);

                const parseResult = await proposal.parseProposal(existingProposalData);
                if (parseResult.state !== 'VALID') {
                    this.network.node.warn(`Failed to parse proposal: ${parseResult.state}`);
                    return null;
                }
            } else {
                // Create new proposal
                const pendingBlocks = await this.network.consensus.pendingBlockManager.getBlocksForContainer();
                this.network.node.debug(`Creating new proposal with ${pendingBlocks.length} pending blocks`);
                if (pendingBlocks.length === 0) return null;

                const lastContainerHash = await this.network.ledger.getLastContainerHash();
                const container = await this.network.consensus.containerProcessor.createContainer(
                    lastContainerHash, 
                    pendingBlocks
                );
                if (!container) return null;

                proposal = new Proposal(this.network, container);
            }

            if(this.pendingContainers.has(proposal.hash)) {
                this.network.node.warn(`Proposal ${proposal.hash} already exists, skipping`);
                return null;
            }

            // Validation timing
            const validationStart = performance.now();
            if (!await this.validateProposal(proposal)) {
                this.network.node.warn(`Invalid proposal ${existingProposalData ? 'received from ' + nodeId : 'created locally'}: ${proposal.hash}`);
                return null;
            }
            this.metrics.validationTime = performance.now() - validationStart;

            this.pendingContainers.set(proposal.hash, proposal);

            // Election timing
            const electionStart = performance.now();
            await this.startContainerValidationElection(proposal, nodeId || this.network.node.nodeId);
            this.metrics.electionStartTime = performance.now() - electionStart;

            // Broadcast timing
            if (!existingProposalData) {
                const broadcastStart = performance.now();
                await this.proposalBroadcaster.propagateProposal(proposal.toJSON());
                this.metrics.broadcastTime = performance.now() - broadcastStart;
            }

            // Update metrics
            this.metrics.lastProcessingTime = performance.now() - startTime;
            this.metrics.proposalCount++;
            this.metrics.lastProposalTimestamp = Date.now();

            // Log performance metrics
            this.network.node.debug('Proposal processing metrics:', {
                totalTime: `${this.metrics.lastProcessingTime.toFixed(2)}ms`,
                validation: `${this.metrics.validationTime.toFixed(2)}ms`,
                electionStart: `${this.metrics.electionStartTime.toFixed(2)}ms`,
                broadcast: `${this.metrics.broadcastTime.toFixed(2)}ms`,
                proposalCount: this.metrics.proposalCount,
                pendingCount: this.pendingContainers.size,
                containerValidation: await this.network.consensus.containerProcessor.validator.getMetrics()
            });

            // Track validator activity when they sign containers
            if (proposal.container.signature) {
                const validatorId = await this.network.ledger.getSignerId(proposal.container);
                await this.network.consensus.validatorSelector.trackValidatorActivity(validatorId);
            }

            return true;
        } catch (err) {
            this.network.node.error('Error processing proposal:', err);
            this.metrics.lastProcessingTime = performance.now() - startTime;
            return null;
        }
    }

    //--------------------------------
    // Election Management
    //--------------------------------

    async startContainerValidationElection(proposal, creator) {
        const electionId = this.network.consensus.electionManager.createElectionId(
            'binary',
            'containerValidation',
            proposal.hash
        );
        
        this.network.node.log(`Starting container validation election for ${proposal.hash}`);
        
        await this.network.consensus.electionManager.startLocalElection(
            'binary',
            'containerValidation',
            electionId,
            proposal.hash,
            {
                proposal: proposal,
                timestamp: Date.now(),
                creator: creator
            }
        );
    }

    async startNextContainerElection(lastContainerHash) {
        const electionId = this.network.consensus.electionManager.createElectionId(
            'selection',
            'nextContainer',
            lastContainerHash
        );
        
        // Find valid candidates
        const candidates = Array.from(this.pendingContainers.values())
            .filter(p => p.previousContainerHash === lastContainerHash && 
                        p.getState() === 'validated');

        if (candidates.length === 0) return;

        // Select our preferred candidate
        const preferredCandidate = await this.selectBestCandidate(candidates);
        if (!preferredCandidate) return;

        this.network.node.log(`Starting next container election`);

        await this.network.consensus.electionManager.startLocalElection(
            'selection',
            'nextContainer',
            electionId,
            preferredCandidate,
            {
                lastContainerHash,
                timestamp: Date.now(),
                messageFormat: 'candidateOnly'
            }
        );
    }

    async onElectionCompleted(result) {
        try {
            const { category, winner, electionId } = result;
            
            if (!winner) {
                this.network.node.warn(`Election ${electionId} completed with no winner`);
                return;
            }

            if (category === 'containerValidation') {
                const validatedProposal = this.pendingContainers.get(winner);
                if (!validatedProposal) {
                    this.network.node.warn(`Winning proposal ${winner} not found`);
                    return;
                }
                validatedProposal.setState('validated');

                try {
                    const lastContainerHash = await this.network.ledger.getLastContainerHash();
                    await this.startNextContainerElection(lastContainerHash);
                } catch (err) {
                    this.network.node.error('Failed to start next container election:', err);
                }
            } else if (category === 'nextContainer') {
                const winningProposal = this.pendingContainers.get(winner);
                if (!winningProposal) {
                    this.network.node.warn(`Winning container proposal ${winner} not found`);
                    return;
                }
                winningProposal.setState('confirmed');

                try {
                    const votes = this.network.consensus.electionManager.getVoteSignatures(electionId);
                    for (const [nodeId, signature] of Object.entries(votes)) {
                        winningProposal.container.validatorSignatures[nodeId] = signature;
                    }
                    this.cleanupCompetingProposals(winningProposal.previousContainerHash);
                    await this.network.consensus.proposalConfirmed(winningProposal);
                } catch (err) {
                    this.network.node.error('Failed to process winning container:', err);
                }
            }
        } catch (err) {
            this.network.node.error('Election completion handling error:', err);
        }
    }

    //--------------------------------
    // Validation & Evaluation
    //--------------------------------

    async validateCreationRequirements() {
        // Check sync status before proposing
        if (this.network.synchronizer.syncState.fallenBehind) {
            this.network.node.warn('Node is syncing, skipping proposal creation');
            return false;
        }
        const currentValidator = await this.network.consensus.validatorSelector.getValidator();
        const isPendingEmpty = this.network.consensus.pendingBlockManager.getPendingBlockCount() === 0;

        let recentElection = false
        for (const election of this.network.consensus.electionManager.activeElections.values()) {
            if (election.creator === this.network.node.nodeId && 
                Date.now() - election.startTime < this.proposalTimeout) {
                recentElection = true;
                break;
            }
        }
        
        this.network.node.debug(`Creation requirements: isValidator=${currentValidator === this.network.node.nodeId}, pendingEmpty=${isPendingEmpty}, hasRecentElection=${!!recentElection}`);
        
        if (currentValidator !== this.network.node.nodeId) {
            this.network.node.log(`Not the current elected validator (${currentValidator}), skipping proposal creation`);
            return false;
        }

        if (isPendingEmpty) {
            this.network.node.log(`No pending blocks, skipping proposal creation`);
            return false;
        }

        if(recentElection) {
            this.network.node.log(`Already waiting for a recent proposal, skipping proposal creation`);
            return false;
        }

        return true;
    }

    async validateProposal(proposal) {
        // 1. Validate election (creator is current validator)
        const currentValidator = await this.network.consensus.validatorSelector.getValidator();
        if (currentValidator !== proposal.creator) {
            this.network.node.warn(`Invalid proposal creator: ${proposal.creator}`);
            return false;
        }

        // 2. Validate chain position
        const lastContainerHash = await this.network.ledger.getLastContainerHash();
        if (lastContainerHash !== proposal.previousContainerHash) {
            this.network.node.warn(`Invalid chain position for proposal: ${proposal.hash}`);
            return false;
        }

        // 3. Validate container structure and contents
        if (!await this.network.consensus.containerProcessor.validateContainer(proposal.container)) {
            this.network.node.warn(`Invalid container in proposal: ${proposal.hash}`);
            return false;
        }

        return true;
    }

    async evaluateProposal(proposal) {
        // Base score starts at 1 and decreases based on proposal age
        const now = Date.now();
        const proposalAge = now - proposal.addedAt;
        const maxAge = this.proposalTimeout; // 10 seconds

        // Score from 1.0 to 0.0 based on age
        // Newer proposals get lower scores
        const score = Math.max(0, 1 - (proposalAge / maxAge));

        return score;
    }

    //--------------------------------
    // Voting Methods
    //--------------------------------

    // Helper to select best candidate based on metrics
    async selectBestCandidate(candidates) {
        let bestCandidate = null;
        let highestScore = -1;

        for (const proposal of candidates) {
            // Only consider validated proposals
            if (proposal.getState() !== 'validated') continue;

            const score = await this.evaluateProposal(proposal);
            if (score > highestScore) {
                highestScore = score;
                bestCandidate = proposal;
            } else if (score === highestScore && proposal.hash < bestCandidate.hash) {
                // Use hash as tiebreaker for deterministic selection
                bestCandidate = proposal;
            }
        }

        return bestCandidate?.hash;
    }

    async amIValidator() {
        const votingWeight = await this.network.ledger.getVoteWeight(this.network.node.nodeId);
        if(!votingWeight) {
            return false;
        }
        if (new Decimal(votingWeight).lt(this.network.consensus.electionManager.validator.minVotingWeight)) {
            return false;
        }

        return true;
    }

    //--------------------------------
    // Utility Methods
    //--------------------------------

    getPendingContainerCount() {
        return this.pendingContainers.size;
    }

    removeProposal(proposalHash) {
        this.pendingContainers.delete(proposalHash);
    }

    // Add validation methods here (e.g. proposal for lastHash too old, etc.)
    async validateContainerValidationVote(voterId, proposalHash, metadata) {
        // Get proposal
        const proposal = await this.pendingContainers.get(proposalHash);
        if (!proposal) {
            return { isValid: false, reason: 'Proposal not found' };
        }

        // Validate proposal
        if (!await this.validateProposal(proposal)) {
            return { isValid: false, reason: 'Invalid proposal' };
        }

        return { isValid: true };
    }

    async validateNextContainerVote(voterId, containerHash, metadata) {
        // Get proposal
        const proposal = await this.pendingContainers.get(containerHash);
        if (!proposal) {
            return { isValid: false, reason: 'Container proposal not found' };
        }

        // Check chain position
        if (proposal.previousContainerHash !== metadata.lastContainerHash) {
            return { isValid: false, reason: 'Invalid chain position' };
        }

        // Check proposal state
        if (proposal.getState() !== 'validated') {
            return { isValid: false, reason: 'Proposal not validated' };
        }

        return { isValid: true };
    }

    async cleanupCompetingProposals(previousContainerHash) {
        // Get all proposals for this chain position
        const competingProposals = Array.from(this.pendingContainers.values())
            .filter(p => p.previousContainerHash === previousContainerHash);

        // Remove all except the confirmed one
        for (const proposal of competingProposals) {
            if (proposal.getState() !== 'confirmed') {
                this.network.node.debug(`Cleaning up competing proposal ${proposal.hash}`);
                this.removeProposal(proposal.hash);
            }
        }
    }

    async storeEarlyProposal(proposalData, fromNodeId) {
        const previousHash = proposalData.previousContainerHash;
        
        if (!this.earlyProposals.has(previousHash)) {
            this.earlyProposals.set(previousHash, new Map());
        }

        const proposals = this.earlyProposals.get(previousHash);
        proposals.set(proposalData.hash, {
            proposal: proposalData,
            fromNodeId,
            timestamp: Date.now()
        });

        this.network.node.debug(`Stored early proposal ${proposalData.hash} for container ${previousHash}`);
    }

    async processEarlyProposals(containerHash) {
        const proposals = this.earlyProposals.get(containerHash);
        if (!proposals) return;

        this.network.node.debug(`Processing ${proposals.size} early proposals for container ${containerHash}`);

        let proposalProcessed = false;
        for (const [proposalHash, {proposal, fromNodeId}] of proposals) {
            const result = await this.processProposal(proposal, fromNodeId);
            if(result) {
                proposalProcessed = true;
                // Broadcast to other peers if received proposal was valid
                this.proposalBroadcaster.propagateProposal(proposal);
            }
        }

        this.earlyProposals.delete(containerHash);
        return proposalProcessed;
    }

    // Add to cleanup method
    cleanupEarlyProposals() {
        const now = Date.now();
        for (const [containerHash, proposals] of this.earlyProposals) {
            for (const [proposalHash, data] of proposals) {
                if (now - data.timestamp > this.earlyProposalTimeout) {
                    proposals.delete(proposalHash);
                }
            }
            if (proposals.size === 0) {
                this.earlyProposals.delete(containerHash);
            }
        }
    }

    async isValidChainPosition(containerHash) {
        try {
            // Check if this container exists in our chain
            const container = await this.network.ledger.getContainer(containerHash);
            return !!container;
        } catch (err) {
            return false;
        }
    }

    // Add a method to get metrics
    getMetrics() {
        return {
            ...this.metrics,
            pendingContainers: this.pendingContainers.size,
            earlyProposals: Array.from(this.earlyProposals.values()).reduce((acc, map) => acc + map.size, 0)
        };
    }
}

module.exports = ProposalManager; 