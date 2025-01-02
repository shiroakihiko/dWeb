const BlockHelper = require('../../utils/blockhelper.js');
const ConsensusValidator = require('./consensusvalidator.js');

class DPoSConsensus {
    constructor(network) {
        this.network = network;
        this.confirmedBlocks = new Set();  // Maps blockId to Block object
        this.pendingBlocks = new Map();  // Maps blockId to Block object
        this.blockVotes = new Map();  // Maps blockId to a list of peers who voted for it
        this.confirmationCallbacks = new Map(); // Holds the callbacks by block hashes
        this.lastVoteRequestTime = 0;  // Timestamp for the last vote request
        this.consensusValidator = new ConsensusValidator(network);

        // Poll every 5 seconds to check and request votes
        setInterval(() => this.requestVotes(), 5000);
    }

    // Get top 20 blocks based on fee priority (highest fee first)
    getTopPriorityBlocks() {
        return Array.from(this.pendingBlocks.values())
        .sort((a, b) => b.fee - a.fee)
        .slice(0, 20);
    }

    // Trigger vote requests and check pending blocks
    requestVotes(forceExecution = false) {
        if (this.pendingBlocks.size === 0) {
            this.network.node.verbose('No pending blocks to vote on.');
            return;
        }

        const currentTime = Date.now();
        if (!forceExecution && currentTime - this.lastVoteRequestTime < 5000) {
            this.network.node.log('Waiting for 5 seconds before sending another vote request.');
            return;
        }

        // Broadcast the votes to peers
        const pendingBlocks = this.getTopPriorityBlocks();
        this.network.node.broadcaster.broadcastVotes(Array.from(this.pendingBlocks.values()));
        this.lastVoteRequestTime = currentTime;
    }

    // Check if the block has a signature from the current node
    hasSignedBlock(block) {
        const signature = block.validatorSignatures[this.network.nodeId];

        // If no signature from the current node, return false
        if (!signature) {
            return false;
        }

        // Now, verify the signature using BlockHelper
        const verified = BlockHelper.verifySignatureWithPublicKey(block, signature, this.network.nodeId);

        // Return whether the signature is valid
        return verified;
    }

    signBlockForVoting(block) {
        // Check if the current node has already signed the block
        if (this.hasSignedBlock(block)) {
            return;
        }

        // Sign the block using the node's private key
        const signature = BlockHelper.signBlock(this.network.node.nodePrivateKey, block);

        // Add the signature to the block's signatures object
        // Use the node's ID as the key for the signature
        block.validatorSignatures[this.network.node.nodeId] = signature;

        //Sort the signatures object by nodeId in ascending order
        const sortedSignatures = {};
        Object.keys(block.validatorSignatures)
        .sort() // Sort by nodeId in ascending order
        .forEach(key => {
            sortedSignatures[key] = block.validatorSignatures[key];
        });

        // Replace the unsorted block.validatorSignatures with the sorted one
        block.validatorSignatures = sortedSignatures;
    }

    // Handle new block proposal with an optional callback on confirmation
    proposeBlock(block, confirmationCallback = null) {
        if(this.confirmedBlocks.has(block.hash))
        {
            confirmationCallback();
            return false;
        }
        if (!this.consensusValidator.validBlock(block)) {
            this.network.node.warn(`Block (${block.type}) ${block.hash} rejected. Invalid block. ${JSON.stringify(block)}`);
            return false;
        }

        if(this.addBlockToPending(block))
        {
            if(confirmationCallback)
                this.confirmationCallbacks.set(block.hash, confirmationCallback);
            
            this.requestVotes(true);
            return true;
        }
        else
           return false;
    }

    // Add a block to the pending list and initialize its votes
    addBlockToPending(block) {
        if (!this.consensusValidator.validBlock(block)) return false;
        this.pendingBlocks.set(block.hash, block);
        this.blockVotes.set(block.hash, []);  // Initialize votes
        this.signBlockForVoting(block);
        this.network.node.log(`Block ${block.hash} added to pending blocks.`);

        return true;
    }

    // Handle votes on blocks from other peers and validate signatures
    blockVotesReceived(nodeId, blocks) {
        this.network.node.log(blocks);
        blocks.forEach(block => {
            // Add block to pending blocks if it's not already present
            this.addBlockToPending(block);

            // Merge signatures, add block to ledger if quorum is achieved
            const pendingBlock = this.pendingBlocks.get(block.hash);
            if (pendingBlock) {
                // Update the nodes present timestamp on the block
                pendingBlock.delegatorTime = Date.now();
                // Merge all signatures of other voters into our pending block for multi sig changes
                this.pendingBlocks.set(block.hash, BlockHelper.mergeSignatures(pendingBlock, block));
                if(this.consensusValidator.validBlockFinalization(pendingBlock))
                {
                    let quorumAchieved = this.consensusValidator.multiSignatureQuorumReached(pendingBlock);
                    if (quorumAchieved) {
                        // Using .then() to handle the promise returned by addBlock
                        this.network.blockManager.addBlock(block)
                        .then((result) => {
                            if (result.state == 'BLOCK_ADDED') {
                                // Only broadcast after the block has been successfully added
                                this.network.node.broadcaster.broadcastBlockConfirmation(result.block);

                                // Call upon any callbacks for the confirmed block
                                const callback = this.confirmationCallbacks.get(block.hash);
                                if(callback)
                                {
                                    callback();
                                    this.confirmationCallbacks.delete(block.hash);
                                }
                                this.confirmedBlocks.add(block.hash);
                            }
                            else
                                this.network.node.error(`Error adding block to ledger: ${result.state}`);

                            // Cast a last vote to other peers who still wait for the quorum to be achieved
                            // Could also be implemented through blockConfirmation message
                            this.network.node.broadcaster.broadcastVotes(Array.from(this.pendingBlocks.values()));
                            // Remove the block from pending once processed
                            this.pendingBlocks.delete(block.hash);
                        })
                        .catch((error) => {
                            this.network.node.error("Error adding block to ledger:", error);
                        });
                    }
                }
                else {
                    this.network.node.error(`Final state for block with ID ${block.hash} not valid yet.`);
                }
            } else {
                this.network.node.error(`Block with ID ${block.hash} not found in pending blocks.`);
            }
        });
    }

    // Get the number of connected validators
    getValidatorCount() {
        return this.network.node.peers.peerManager.connectedPeers.size;
    }

    // Get the count of pending blocks
    getPendingCount() {
        return this.pendingBlocks.size;
    }

    // Returns whether or not a block is already pending
    hasPending(blockId) {
        return this.pendingBlocks.has(blockId);
    }
}

module.exports = DPoSConsensus;
