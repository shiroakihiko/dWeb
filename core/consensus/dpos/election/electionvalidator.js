const Decimal = require('decimal.js');
const Signer = require('../../../utils/signer.js');
class ElectionValidator {
    constructor(network) {
        this.network = network;
        this.validCategories = new Set(['blockValidation', 'nextBlock', 'validator', 'remoteNetworkUpdate', 'governance:proposalEnd']);
        this.validTypes = new Set(['binary', 'selection']);
        this.quorumThreshold = new Decimal(0.67);
        this.minVotingWeight = new Decimal(0.01);
        this.voteValidators = new Map(); // Store category-specific validators
    }
    Stop() {
        this.voteValidators.clear();
    }
    registerVoteValidator(category, validatorFunction) {
        this.voteValidators.set(category, validatorFunction);
    }

    /**
     * Validate election parameters when creating from vote
     */
    validateElectionParameters(type, category, metadata = {}) {
        const errors = [];

        // Basic parameter validation
        if (!this.validTypes.has(type)) {
            errors.push(`Invalid election type: ${type}`);
        }

        if (!this.validCategories.has(category)) {
            errors.push(`Invalid election category: ${category}`);
        }

        if (errors.length > 0) {
            throw new Error(`Election validation failed: ${errors.join(', ')}`);
        }

        return true;
    }

    /**
     * Check if this node is eligible to vote
     */
    amIValidator() {
        const weight = this.network.ledger.getVoteWeight(this.network.node.nodeId);
        return weight && new Decimal(weight).gt(0);
    }

    /**
     * Validate a vote before processing
     */
    async validateVote(election, voterId, candidateId, signature, metadata) {
        try {
            // Check if election is still active
            if (!election.isActive()) {
                return { isValid: false, reason: 'Election not active' };
            }

            // Check for duplicate votes
            if (election.hasVote(voterId)) {
                return { isValid: false, reason: 'Duplicate vote' };
            }

            // Validate voter eligibility
            if (!this.isEligibleVoter(voterId)) {
                return { isValid: false, reason: 'Voter not eligible' };
            }

            // Get the registered validator for this category
            const validator = this.voteValidators.get(election.category);
            if (!validator) {
                return { isValid: false, reason: `No validator registered for category: ${election.category}` };
            }

            // Run category-specific validation
            const validation = validator(voterId, candidateId, metadata);
            if (!validation.isValid) {
                return validation;
            }

            // Validate signature
            const message = this.getSignatureMessage(election.category, election.id, candidateId);
            const validSignature = await Signer.verifySignatureWithPublicKey(
                message,
                signature,
                voterId
            );

            if (!validSignature) {
                return { isValid: false, reason: 'Invalid signature' };
            }

            return { isValid: true };
        } catch (err) {
            this.network.node.error('Vote validation error:', err);
            return { isValid: false, reason: `Validation error: ${err.message}` };
        }
    }

    getSignatureMessage(category, electionId, candidateId) {
        switch (category) {
            case 'blockValidation':
                return `${electionId}:${candidateId}`;
            case 'nextBlock':
                return candidateId;
            case 'remoteNetworkUpdate':
                return candidateId;
            case 'governance:proposalEnd':
                return candidateId;
            default:
                return `${electionId}:${candidateId}`;
        }
    }

    isEligibleVoter(voterId) {
        const weight = this.network.ledger.getVoteWeight(voterId);
        return weight && new Decimal(weight).gt(0);
    }


    hasConsensus(election) {
        const totalWeight = this.network.ledger.getTotalVoteWeight();
        if (!totalWeight) return false;

        const votingWeight = this.calculateVotingWeight(election.getVoterIds());
        return votingWeight.div(totalWeight).gte(this.quorumThreshold);
    }

    calculateVotingWeight(voterIds) {
        let totalWeight = new Decimal(0);
        for (const voterId of voterIds) {
            const weight = this.network.ledger.getVoteWeight(voterId);
            if (weight) {
                totalWeight = totalWeight.plus(new Decimal(weight));
            }
        }
        return totalWeight;
    }
}

module.exports = ElectionValidator; 