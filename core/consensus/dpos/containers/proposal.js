const ContainerHelper = require('../../../utils/containerhelper.js');

class Proposal {
    /**
     * @param {Network} network - Network instance
     * @param {Container} [container] - Optional initial container
     */
    constructor(network, container = null) {
        this.addedAt = Date.now();
        this.network = network;
        this.container = container;
        this.blocks = [];
        this.state = 'queued'; // queued | active | complete | failed
        this.timestamp = Date.now();
        this.previousContainerHash = container?.previousContainerHash;
        this.creator = container?.creator;
        this.requestingStarted = false;
        this.isValidated = false;
        if(container) {
            this.hash = container.hash;
        }
    }

    async parseProposal(proposal) {
        // Parse the proposal
        this.hash = proposal.hash;
        this.previousContainerHash = proposal.previousContainerHash;
        this.blocks = proposal.blocks;
        this.creator = proposal.creator;
        this.timestamp = proposal.timestamp;
        this.validatorSignatures = proposal.validatorSignatures;

        // Create the container
        const container = await this.network.consensus.containerProcessor.createContainer(proposal.previousContainerHash);
        container.blocks = proposal.blocks;
        container.creator = proposal.creator;
        container.timestamp = proposal.timestamp;
        container.validatorSignatures = proposal.validatorSignatures;
        container.hash = proposal.hash;
        this.container = container;

        // Adding votes from votemanager to the container
        // In case we received a vote before we received the proposal
        const votes = this.network.consensus.electionManager.getVoteSignatures(proposal.hash);
        if(votes) {
            for(const [nodeId, signature] of Object.entries(votes)) {
                container.validatorSignatures[nodeId] = signature;
            }
        }

        const hash = ContainerHelper.generateContainerHash(container);
        if(hash != proposal.hash || hash != container.hash) {
            return {state: 'INVALID_HASH'};
        }

        return {state: 'VALID'};
    }

    addVote(vote) {
        this.container.validatorSignatures[vote.nodeId] = vote.signature;
    }

    toJSON() {
        return {
            hash: this.container.hash,
            previousContainerHash: this.container.previousContainerHash,
            blocks: this.container.blocks,
            creator: this.container.creator,
            timestamp: this.container.timestamp,
            validatorSignatures: this.container.validatorSignatures
        };
    }

    setState(state) {
        this.state = state;
    }
    getState() {
        return this.state;
    }
}

module.exports = Proposal;