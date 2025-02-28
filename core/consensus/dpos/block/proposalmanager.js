const Decimal = require('decimal.js');
const Proposal = require('./proposal');
const ProposalBroadcaster = require('./proposalbroadcaster');
const Signer = require('../../../utils/signer');
const Wallet = require('../../../wallet/wallet.js');
const path = require('path');

class ProposalManager {
    constructor(network) {
        this.network = network;
        this.proposalBroadcaster = new ProposalBroadcaster(network);
        this.proposalTimeout = 10000;
        this.pendingBlocks = new Map(); // blockHash -> proposal
        this.validatedProposals = new Map(); // previousBlockHash -> Set<proposal>
        // Initialize proposal processing queue
        this.proposalQueue = Promise.resolve(); // Instead of a lock to prevent race conditions, we use a queue to process proposals
        this.earlyProposals = new Map(); // previousBlockHash -> Map<proposalHash, {proposal, fromNodeId}>
        this.earlyProposalTimeout = 120000; // 120 seconds

        this.isProposing = false;  // Add a flag to track proposal state
        this.lastProposalAttempt = 0;  // Track last attempt timestamp
        this.minProposalInterval = 2000;  // Minimum time between proposals (2 seconds)
        this.proposalLock = Promise.resolve();
        this.processingProposals = new Set(); // Track proposals being processed

        // Add metrics tracking
        this.metrics = {
            lastProcessingTime: 0,
            validationTime: 0,
            electionStartTime: 0,
            broadcastTime: 0,
            proposalCount: 0,
            lastProposalTimestamp: 0
        };

        // Add a processing lock map
        this.processingLocks = new Map(); // blockId -> Promise

        // Track finalized blocks
        this.finalizedBlocks = new Map(); // previousBlockHash -> Promise<void>

        this.lastConfirmationTime = 0;  // Track last confirmation timestamp
    }
    async initialize() {
        this.network.consensus.electionManager.on('election:completed', this.onElectionCompleted.bind(this));
        
        // Register vote validators only
        this.network.consensus.electionManager.validator.registerVoteValidator(
            'blockValidation',
            (voterId, candidateId, metadata) => {
                return this.validateBlockValidationVote(voterId, candidateId, metadata);
            }
        );

        this.network.consensus.electionManager.validator.registerVoteValidator(
            'nextBlock',
            (voterId, candidateId, metadata) => {
                return this.validateNextBlockVote(voterId, candidateId, metadata);
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
    // Main Block Processing Flow
    //--------------------------------
    async process() {
        const startTime = Date.now();
        setImmediate(() => {
            this.network.node.debug(`Starting proposal process, time since last block: ${startTime - this.lastConfirmationTime}ms`);
            this.startOwnProposal();
        });
    }

    async startOwnProposal() {
        await this.queueProposalProcessing(async () => {
            const validationStart = Date.now();
            const canCreate = this.validateCreationRequirements();
            const validationTime = Date.now() - validationStart;
            
            this.network.node.debug(
                `Creation requirements check took ${validationTime}ms, ` +
                `canCreate=${canCreate}, ` +
                `pendingActions=${this.network.consensus.pendingActionManager.getPendingActionCount()}, ` +
                `currentValidator=${this.network.consensus.validatorSelector.getValidator()}`
            );

            if(canCreate) {
                this.processProposal();
            }
            return canCreate;
        });
    }

    async onProposalReceived(proposalData, fromNodeId) {
        await this.queueProposalProcessing(async () => {
            const lastBlockHash = this.network.ledger.getLastBlockHash();
            
            // If proposal's previous hash is ahead of our current state
            if (proposalData.previousBlockHash !== lastBlockHash) {
                // Store as early proposal
                await this.storeEarlyProposal(proposalData, fromNodeId);
                return;
            }

            this.processProposal(proposalData, fromNodeId);
        });
    }

    async acquireLock() {
        let release;
        const newLock = new Promise(resolve => {
            release = resolve;
        });

        const oldLock = this.proposalLock;
        this.proposalLock = newLock;
        await oldLock;

        return release;
    }

    async processProposal(existingProposalData = null, nodeId = null) {
        const startTime = performance.now();
        const gapTime = this.lastConfirmationTime ? Date.now() - this.lastConfirmationTime : 0;

        try {
            // Check if we're already finalizing a block for this chain position
            const previousBlockHash = existingProposalData ? 
                existingProposalData.previousBlockHash : 
                this.network.ledger.getLastBlockHash();

            if (this.isBlockBeingFinalized(previousBlockHash)) {
                this.network.node.warn(`Already finalizing a block for position ${previousBlockHash}, skipping validation`);
                return null;
            }

            let proposal;
            if (existingProposalData) {
                // Handle received proposal
                const parseStart = performance.now();
                proposal = new Proposal(this.network);
                
                const parseResult = await proposal.parseProposal(existingProposalData);
                if (parseResult.state !== 'VALID') {
                    this.network.node.warn(`Failed to parse proposal: ${parseResult.state}`);
                    return null;
                }
                this.metrics.parseTime = performance.now() - parseStart;
            } else {
                // Create new proposal
                const createStart = performance.now();
                const pendingActions = await this.network.consensus.pendingActionManager.getActionsForBlock();
                this.network.node.debug(`Creating new proposal with ${pendingActions.length} pending actions`);
                if (pendingActions.length === 0) return null;

                const block = await this.network.consensus.blockProcessor.createBlock({
                    previousBlockHash, 
                    actions: pendingActions
                });
                if (!block) return null;

                proposal = new Proposal(this.network, block);
                this.metrics.createTime = performance.now() - createStart;
            }

            if(this.pendingBlocks.has(proposal.hash)) {
                this.network.node.warn(`Proposal ${proposal.hash} already exists, skipping`);
                return null;
            }

            if(!this.validateProposalOrder(proposal)) {
                this.network.node.warn(`Invalid proposal order: ${proposal.hash}`);
                return null;
            }

            // Validation timing
            const validationStart = performance.now();
            if (!(await this.validateProposal(proposal))) {
                this.network.node.warn(`Invalid proposal ${existingProposalData ? 'received from ' + nodeId : 'created locally'}: ${proposal.hash}`);
                return null;
            }
            this.metrics.validationTime = performance.now() - validationStart;

            this.pendingBlocks.set(proposal.hash, proposal);

            // Election timing
            const electionStart = performance.now();
            this.startBlockValidationElection(proposal, nodeId || this.network.node.nodeId);
            this.metrics.electionStartTime = performance.now() - electionStart;

            // Broadcast timing
            if (!existingProposalData) {
                const broadcastStart = performance.now();
                this.proposalBroadcaster.propagateProposal(proposal.toJSON());
                this.metrics.broadcastTime = performance.now() - broadcastStart;
            }

            // Update metrics
            this.metrics.lastProcessingTime = performance.now() - startTime;
            this.metrics.proposalCount++;
            this.metrics.lastProposalTimestamp = Date.now();

            // Log performance metrics
            this.network.node.debug('Proposal processing metrics:', {
                gapFromLastBlock: `${gapTime}ms`,
                totalTime: `${this.metrics.lastProcessingTime.toFixed(2)}ms`,
                parse: `${this.metrics.parseTime ? this.metrics.parseTime.toFixed(2) : 'N/A'}ms`,
                create: `${this.metrics.createTime ? this.metrics.createTime.toFixed(2) : 'N/A'}ms`,
                validation: `${this.metrics.validationTime.toFixed(2)}ms`,
                electionStart: `${this.metrics.electionStartTime.toFixed(2)}ms`,
                broadcast: `${this.metrics.broadcastTime.toFixed(2)}ms`,
                proposalCount: this.metrics.proposalCount,
                pendingCount: this.pendingBlocks.size,
                blockValidation: this.network.consensus.blockProcessor.validator.getMetrics()
            });

            return proposal;
        } catch (err) {
            this.network.node.error('Error processing proposal:', err);
            this.metrics.lastProcessingTime = performance.now() - startTime;
            return null;
        }
    }

    //--------------------------------
    // Election Management
    //--------------------------------

    startBlockValidationElection(proposal, creator) {
        const electionId = this.network.consensus.electionManager.createElectionId(
            'binary',
            'blockValidation',
            proposal.hash
        );
        
        this.network.node.log(`Starting block validation election for ${proposal.hash}`);
        
        this.network.consensus.electionManager.startLocalElection(
            'binary',
            'blockValidation',
            electionId,
            proposal.hash,
            {
                timestamp: Date.now(),
                creator: creator
            }
        );
    }

    async startNextBlockElection(lastBlockHash) {
        const electionId = this.network.consensus.electionManager.createElectionId(
            'selection',
            'nextBlock',
            lastBlockHash
        );
        
        const candidates = Array.from(this.validatedProposals.get(lastBlockHash) || []);
        if (candidates.length === 0) return;

        const preferredCandidate = this.selectBestCandidate(candidates);
        if (!preferredCandidate) return;

        const proposal = this.pendingBlocks.get(preferredCandidate);
        
        // Sign cross-network actions as well
        let crossNetworkSignatures = null;
        if (proposal.block.crossNetworkActions.baseHash) {
            crossNetworkSignatures = {};
            
            // Sign with the node account
            crossNetworkSignatures[this.network.node.nodeId] = await Signer.signMessage(
                proposal.block.crossNetworkActions.baseHash,
                this.network.node.nodePrivateKey
            );

            // Sign with the networks genesis account if we have it.
            // Required for intitial network updates on other chains, once the network update
            // with distributed vote weights has been established it's no longer needed for that particular network
            const genesisBlockHash = this.network.ledger.getGenesisBlockHash();
            const fileName = `${this.network.webName}_${genesisBlockHash.substring(0, 12)}.json`;
            const genesisWallet = new Wallet(path.join(process.cwd(), 'wallets', fileName));
            await genesisWallet.initialize();
            const genesisAccount = genesisWallet.getPublicKeys()[0];
            if(genesisAccount === this.network.ledger.getGenesisAccount()) {
                crossNetworkSignatures[genesisAccount] = await Signer.signMessage(
                    proposal.block.crossNetworkActions.baseHash,
                    genesisWallet.getAccounts()[0].privateKey
                );
            }
        }

        this.network.consensus.electionManager.startLocalElection(
            'selection',
            'nextBlock',
            electionId,
            preferredCandidate,
            {
                lastBlockHash,
                timestamp: Date.now(),
                messageFormat: 'candidateOnly',
                crossNetworkSignatures
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

            if (category === 'blockValidation') {
                const validatedProposal = this.pendingBlocks.get(winner);
                if (!validatedProposal) {
                    this.network.node.warn(`Winning proposal ${winner} not found`);
                    return;
                }
                validatedProposal.validatedAt = Date.now();
                validatedProposal.setState('validated');

                this.network.node.log(`[${validatedProposal.hash}] Proposal validation completed: ${result.electionId} in ${Date.now() - validatedProposal.addedAt}ms`);
                
                // Add to validated proposals
                if (!this.validatedProposals.has(validatedProposal.previousBlockHash)) {
                    this.validatedProposals.set(validatedProposal.previousBlockHash, new Set());
                }
                this.validatedProposals.get(validatedProposal.previousBlockHash).add(validatedProposal);

                try {
                    const lastBlockHash = this.network.ledger.getLastBlockHash();
                    await this.startNextBlockElection(lastBlockHash);
                } catch (err) {
                    this.network.node.error('Failed to start next block election:', err);
                }
            } else if (category === 'nextBlock') {
                const winningProposal = this.pendingBlocks.get(winner);
                if (!winningProposal) {
                    this.network.node.warn(`Winning block proposal ${winner} not found`);
                    return;
                }

                // Start finalization and get cleanup callback
                const finalizationComplete = await this.startBlockFinalization(winningProposal);
                if (!finalizationComplete) {
                    this.network.node.warn(`Block ${winningProposal.previousBlockHash} is already being finalized`);
                    return;
                }

                try {
                    // Get votes and process winning block
                    const votes = this.network.consensus.electionManager.getVotesForElection(electionId);
                    
                    for (const [nodeId, voteData] of Object.entries(votes)) {
                        winningProposal.block.validatorSignatures[nodeId] = voteData.signature;
                        if(voteData.metadata.crossNetworkSignatures) {
                            for (const [networkAccount, signature] of Object.entries(voteData.metadata.crossNetworkSignatures)) {
                                winningProposal.block.crossNetworkActions.validatorSignatures[networkAccount] = signature;
                            }
                        }
                    }

                    await this.network.consensus.proposalConfirmed(winningProposal);
                    winningProposal.confirmedAt = Date.now();
                    //winningProposal.setState('confirmed');

                    const endTime = Date.now();
                    this.network.node.log(
                        `Election completion [${winningProposal.hash}] finished in ${endTime - winningProposal.addedAt}ms total. ` +
                        `Validation: ${winningProposal.validatedAt - winningProposal.addedAt}ms, ` +
                        `Confirmation: ${winningProposal.confirmedAt - winningProposal.validatedAt}ms`
                    );
                } catch (err) {
                    this.network.node.error('Failed to process winning block:', err);
                    this.clearBlockFinalization(winningProposal.previousBlockHash);
                    finalizationComplete();
                }
            }
        } catch (err) {
            this.network.node.error('Election completion handling error:', err);
            if (winner) {
                const proposal = this.pendingBlocks.get(winner);
                if (proposal) {
                    this.clearBlockFinalization(proposal.previousBlockHash);
                }
            }
        }
    }

    //--------------------------------
    // Validation & Evaluation
    //--------------------------------

    validateCreationRequirements() {
        // Check sync status before proposing
        if (this.network.synchronizer.syncState.fallenBehind) {
            this.network.node.warn('Node is syncing, skipping proposal creation');
            return false;
        }
        const currentValidator = this.network.consensus.validatorSelector.getValidator();
        const isPendingEmpty = this.network.consensus.pendingActionManager.getPendingActionCount() === 0;

        let recentElection = false
        for (const election of this.network.consensus.electionManager.activeElections.values()) {
            if (election.creator === this.network.node.nodeId && 
                Date.now() - election.startTime < this.proposalTimeout) {
                recentElection = true;
                break;
            }
        }
        if(this.network.consensus.electionManager.activeElections.size !== 0) {
            this.network.node.log(`Already waiting for a recent proposal, skipping proposal creation`);
            return false;
        }
        
        this.network.node.debug(`Creation requirements: isValidator=${currentValidator === this.network.node.nodeId}, pendingEmpty=${isPendingEmpty}, hasRecentElection=${!!recentElection}`);
        
        if (currentValidator !== this.network.node.nodeId) {
            this.network.node.log(`Not the current elected validator (${currentValidator}), skipping proposal creation`);
            return false;
        }

        if (isPendingEmpty) {
            this.network.node.log(`No pending actions, skipping proposal creation`);
            return false;
        }

        if(recentElection) {
            this.network.node.log(`Already waiting for a recent proposal, skipping proposal creation`);
            return false;
        }

        return true;
    }

    async validateProposal(proposal) {
        //  Validate block structure and contents
        if (!(await this.network.consensus.blockProcessor.validateBlock(proposal.block, {ignoreConfirmationCheck: true}))) {
            this.network.node.warn(`Invalid block in proposal: ${proposal.hash}`);
            return false;
        }

        return true;
    }

    validateProposalOrder(proposal)
    {
        // 1. Validate election (creator is current validator)
        const currentValidator = this.network.consensus.validatorSelector.getValidator();
        if (currentValidator !== proposal.creator) {
            this.network.node.warn(`Invalid proposal creator: ${proposal.creator}`);
            return false;
        }

        // 2. Validate chain position
        const lastBlockHash = this.network.ledger.getLastBlockHash();
        if (lastBlockHash !== proposal.previousBlockHash) {
            this.network.node.warn(`Invalid chain position for proposal: ${proposal.hash}`);
            return false;
        }

        return true;
    }

    evaluateProposal(proposal) {
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
    selectBestCandidate(candidates) {
        let bestCandidate = null;
        let highestScore = -1;

        // Sort candidates by hash first to ensure deterministic order
        candidates.sort((a, b) => a.hash.localeCompare(b.hash));

        for (const proposal of candidates) {
            // Only consider validated proposals
            if (proposal.getState() !== 'validated') continue;

            // Calculate score based on multiple factors
            const score = this.calculateProposalScore(proposal);
            
            if (score > highestScore) {
                highestScore = score;
                bestCandidate = proposal;
            }
        }

        return bestCandidate?.hash;
    }

    calculateProposalScore(proposal) {
        // Base score starts at 1 and decreases based on proposal age
        const now = Date.now();
        const proposalAge = now - proposal.addedAt;
        const maxAge = this.proposalTimeout;

        // Age score (0.0 to 1.0, newer proposals get higher scores)
        const ageScore = Math.max(0, 1 - (proposalAge / maxAge));

        // Action count score (more actions is better)
        const actionCountScore = Math.min(1, proposal.block.actions.length / 100);

        // Total score (weighted combination)
        const totalScore = (ageScore * 0.6) + (actionCountScore * 0.4);

        return totalScore;
    }

    amIValidator() {
        const votingWeight = this.network.ledger.getVoteWeight(this.network.node.nodeId);
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

    getPendingBlockCount() {
        return this.pendingBlocks.size;
    }

    // Method called after a proposal has been completed and added to the ledger
    proposalCompleted(proposalHash) {
        const proposal = this.pendingBlocks.get(proposalHash);
        if (proposal) {
            const now = Date.now();
            const gapToNext = now - this.lastConfirmationTime;
            this.lastConfirmationTime = now;

            this.network.node.log(
                `Block ${proposalHash} completed. ` +
                `Lifecycle: ${now - proposal.addedAt}ms ` +
                `(Time between confirmations: ${gapToNext}ms)`
            );

            // Clear finalization state
            const resolveFinalization = this.finalizedBlocks.get(proposal.previousBlockHash);
            if (resolveFinalization) {
                this.clearBlockFinalization(proposal.previousBlockHash);
                resolveFinalization();
            }

            // Clean up validated proposals
            const validatedSet = this.validatedProposals.get(proposal.previousBlockHash);
            if (validatedSet) {
                validatedSet.delete(proposal);
                if (validatedSet.size === 0) {
                    this.validatedProposals.delete(proposal.previousBlockHash);
                }
            }

            this.removeProposal(proposalHash);
            this.cleanupCompetingProposals(proposal.previousBlockHash);
            // Process any early proposals waiting for this block to be confirmed
            this.processEarlyProposals(proposalHash);
            this.process();
        }
        else {
            this.network.node.warn(`Proposal ${proposalHash} not found. What the fuck.`);
        }
    }

    // Remove a proposal from the pending blocks
    removeProposal(proposalHash) {
        this.pendingBlocks.delete(proposalHash);
    }

    // Add validation methods here (e.g. proposal for lastHash too old, etc.)
    async validateBlockValidationVote(voterId, proposalHash, metadata) {
        /*
        // Get proposal
        const proposal = this.pendingBlocks.get(proposalHash);
        if (!proposal) {
            return { isValid: false, reason: 'Proposal not found' };
        }

        // Validate proposal order still valid
        if (!this.validateProposalOrder(proposal)) {
            return { isValid: false, reason: 'Invalid proposal order' };
        }
*/
        return { isValid: true };
    }

    async validateNextBlockVote(voterId, blockHash, metadata) {
        const proposal = this.pendingBlocks.get(blockHash);
        if (!proposal) {
            return { isValid: false, reason: 'Block proposal not found' };
        }

        // Check chain position
        if (proposal.previousBlockHash !== metadata.lastBlockHash) {
            return { isValid: false, reason: 'Invalid chain position' };
        }

        // Only verify cross-network signature if block has cross-network actions
        if (proposal.block.crossNetworkActions.baseHash) {
            if (!metadata.crossNetworkSignatures[voterId]) {
                return { isValid: false, reason: 'Missing cross-network signature' };
            }

            const validSignature = await Signer.verifySignatureWithPublicKey(
                proposal.block.crossNetworkActions.baseHash,
                metadata.crossNetworkSignatures[voterId],
                voterId
            );
            if (!validSignature) {
                return { isValid: false, reason: 'Invalid cross-network signature' };
            }

            // Verify the genesis account signature if it exists
            const genesisAccount = this.network.ledger.getGenesisAccount();
            if(metadata.crossNetworkSignatures[genesisAccount]) {
                const validSignature = await Signer.verifySignatureWithPublicKey(
                    proposal.block.crossNetworkActions.baseHash,
                    metadata.crossNetworkSignatures[genesisAccount],
                    genesisAccount
                );
                if (!validSignature) {
                    return { isValid: false, reason: 'Invalid cross-network signature for genesis account' };
                }
            }
        }

        return { isValid: true };
    }

    cleanupCompetingProposals(previousBlockHash) {
        // Get all proposals for this chain position
        const competingProposals = Array.from(this.pendingBlocks.values())
            .filter(p => p.previousBlockHash === previousBlockHash);

        // Remove all except the confirmed one
        for (const proposal of competingProposals) {
            if (proposal.getState() !== 'confirmed') {
                this.network.node.debug(`Cleaning up competing proposal ${proposal.hash}`);
                this.removeProposal(proposal.hash);
            }
        }
    }

    async storeEarlyProposal(proposalData, fromNodeId) {
        const previousHash = proposalData.previousBlockHash;
        
        if (!this.earlyProposals.has(previousHash)) {
            this.earlyProposals.set(previousHash, new Map());
        }

        const proposals = this.earlyProposals.get(previousHash);
        proposals.set(proposalData.hash, {
            proposal: proposalData,
            fromNodeId,
            timestamp: Date.now()
        });

        this.network.node.debug(`Stored early proposal ${proposalData.hash} for block ${previousHash}`);
    }

    async processEarlyProposals(blockHash) {
        const proposals = this.earlyProposals.get(blockHash);
        if (!proposals) return;

        this.network.node.debug(`Processing ${proposals.size} early proposals for block ${blockHash}`);

        let proposalProcessed = false;
        for (const [proposalHash, {proposal, fromNodeId}] of proposals) {
            this.onProposalReceived(proposal, fromNodeId);
        }

        this.earlyProposals.delete(blockHash);
        return proposalProcessed;
    }

    // Add to cleanup method
    cleanupEarlyProposals() {
        const now = Date.now();
        for (const [blockHash, proposals] of this.earlyProposals) {
            for (const [proposalHash, data] of proposals) {
                if (now - data.timestamp > this.earlyProposalTimeout) {
                    proposals.delete(proposalHash);
                }
            }
            if (proposals.size === 0) {
                this.earlyProposals.delete(blockHash);
            }
        }
    }

    isValidChainPosition(blockHash) {
        try {
            // Check if this block exists in our chain
            const block = this.network.ledger.getBlock(blockHash);
            return !!block;
        } catch (err) {
            return false;
        }
    }

    // Add a method to get metrics
    getMetrics() {
        return {
            ...this.metrics,
            pendingBlocks: this.pendingBlocks.size,
            earlyProposals: Array.from(this.earlyProposals.values()).reduce((acc, map) => acc + map.size, 0)
        };
    }

    // Add helper methods for finalization state
    isBlockBeingFinalized(previousBlockHash) {
        return this.finalizedBlocks.has(previousBlockHash);
    }

    async startBlockFinalization(proposal) {
        const blockId = proposal.previousBlockHash;
        if (this.isBlockBeingFinalized(blockId)) {
            return false;
        }

        let resolveFinalization;
        const finalizationPromise = new Promise(resolve => {
            resolveFinalization = resolve;
        });
        this.finalizedBlocks.set(blockId, resolveFinalization);

        return resolveFinalization;
    }

    clearBlockFinalization(previousBlockHash) {
        this.finalizedBlocks.delete(previousBlockHash);
    }
}

module.exports = ProposalManager; 