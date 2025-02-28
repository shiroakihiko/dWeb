const BlockHelper = require('../../../utils/blockhelper.js');
const Block = require('../../../system/block/block.js');
class Proposal {
    /**
     * @param {Network} network - Network instance
     * @param {Block} [block] - Optional initial block
     */
    constructor(network, block = null) {
        this.network = network;

        this.block = block;
        this.actions = [];
        this.state = 'queued'; // queued | active | complete | failed
        this.timestamp = Date.now();
        this.previousBlockHash = block?.previousBlockHash;
        this.creator = block?.creator;
        
        this.addedAt = Date.now();
        this.validatedAt = null;
        this.confirmedAt = null;

        if(block) {
            this.hash = block.hash;
        }
    }

    async parseProposal(blockProposalData) {
        // Parse the proposal
        this.hash = blockProposalData.hash;
        this.previousBlockHash = blockProposalData.previousBlockHash;
        this.actions = blockProposalData.actions;
        this.creator = blockProposalData.creator;
        this.timestamp = blockProposalData.timestamp;
        this.validatorSignatures = blockProposalData.validatorSignatures;

        // Create the block
        const block = new Block(blockProposalData);
        this.block = block;

        // Adding votes from votemanager to the block
        // In case we received a vote before we received the proposal
        const votes = this.network.consensus.electionManager.getVotesForElection(block.hash);
        if(votes) {
            for(const [nodeId, vote] of Object.entries(votes)) {
                block.validatorSignatures[nodeId] = vote.signature;
                block.crossNetworkActions.validatorSignatures[nodeId] = vote.metadata.crossNetworkSignatures[nodeId];
                
                // Add the genesis account signature if it exists
                const genesisAccount = this.network.ledger.getGenesisAccount();
                if(block.crossNetworkActions.validatorSignatures[genesisAccount]) {
                    block.crossNetworkActions.validatorSignatures[genesisAccount] = vote.metadata.crossNetworkSignatures[genesisAccount];
                }
            }
        }

        const hash = await BlockHelper.generateBlockHash(block);
        if(hash != this.hash || hash != block.hash) {
            return {state: 'INVALID_HASH'};
        }

        return {state: 'VALID'};
    }

    addVote(vote) {
        this.block.validatorSignatures[vote.nodeId] = vote.signature;
    }

    toJSON() {
        return {
            hash: this.block.hash,
            previousBlockHash: this.block.previousBlockHash,
            actions: this.block.actions,
            creator: this.block.creator,
            timestamp: this.block.timestamp,
            crossNetworkActions: this.block.crossNetworkActions,
            validatorSignatures: this.block.validatorSignatures
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