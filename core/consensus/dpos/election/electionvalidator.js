const Decimal = require('decimal.js');
const Signer = require('../../../utils/signer.js');
class ElectionValidator {
    constructor(network) {
        this.network = network;
        this.validCategories = new Set(['containerValidation', 'nextContainer', 'validator']);
        this.validTypes = new Set(['binary', 'selection']);
        this.quorumThreshold = new Decimal(0.67);
        this.minVotingWeight = new Decimal(0.01);
        this.voteValidators = new Map(); // Store category-specific validators
    }

    registerVoteValidator(category, validatorFunction) {
        this.voteValidators.set(category, validatorFunction);
    }

    /**
     * Validate election parameters when creating from vote
     */
    async validateElectionParameters(type, category, metadata = {}) {
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
    async amIValidator() {
        const weight = await this.network.ledger.getVoteWeight(this.network.node.nodeId);
        return weight && new Decimal(weight).gt(0);
    }

    /**
     * Validate a vote before processing
     */
    async validateVote(election, voterId, candidateId, signature) {
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
            if (!await this.isEligibleVoter(voterId)) {
                return { isValid: false, reason: 'Voter not eligible' };
            }

            // Get the registered validator for this category
            const validator = this.voteValidators.get(election.category);
            if (!validator) {
                return { isValid: false, reason: `No validator registered for category: ${election.category}` };
            }

            // Run category-specific validation
            const validation = await validator(voterId, candidateId, election.metadata);
            if (!validation.isValid) {
                return validation;
            }

            // Validate signature
            const message = this.getSignatureMessage(election.category, election.id, candidateId);
            const signer = new Signer(this.network.node.nodePrivateKey);
            const validSignature = await signer.verifySignatureWithPublicKey(
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
            case 'containerValidation':
                return `${electionId}:${candidateId}`;
            case 'nextContainer':
                return candidateId;
            default:
                return `${electionId}:${candidateId}`;
        }
    }

    /**
     * Category-specific vote validation
     */
    async validateCategoryVote(category, voterId, candidateId, metadata) {
        switch (category) {
            case 'containerValidation':
            case 'nextContainer':
                return await this.network.consensus.proposalManager
                    .validateVote(category, voterId, candidateId, metadata);
            default:
                return { isValid: false, reason: `Unknown category: ${category}` };
        }
    }

    async isEligibleVoter(voterId) {
        const weight = await this.network.ledger.getVoteWeight(voterId);
        return weight && new Decimal(weight).gt(0);
    }


    async hasConsensus(election) {
        const totalWeight = await this.network.ledger.getTotalVoteWeight();
        if (!totalWeight) return false;

        const votingWeight = await this.calculateVotingWeight(election.getVoterIds());
        return votingWeight.div(totalWeight).gte(this.quorumThreshold);
    }

    async calculateVotingWeight(voterIds) {
        let totalWeight = new Decimal(0);
        for (const voterId of voterIds) {
            const weight = await this.network.ledger.getVoteWeight(voterId);
            if (weight) {
                totalWeight = totalWeight.plus(new Decimal(weight));
            }
        }
        return totalWeight;
    }
}

module.exports = ElectionValidator; 