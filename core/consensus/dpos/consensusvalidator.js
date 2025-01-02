const Decimal = require('decimal.js');

class ConsensusValidator {
    constructor(network) {
        this.network = network;
        this.quorumThreshold = 0.67;  // 67% quorum for block confirmation
    }

    // Validate a block
    validBlock(block) {
        let validateResult = this.network.blockManager.validateBlock(block);
        if(validateResult.state != 'VALID')
        {
            this.network.node.log(`Invalid block (${block.type}): ${validateResult.state}`);
            return false;
        }

        return true;
    }
    
    // Validate the final block after it's been passed around by nodes (e.g. for multi signature checks)
    validBlockFinalization(block)
    {
        let validateResult = this.network.blockManager.validBlockFinalization(block);
        return validateResult.state == 'VALID';
    }

    // Calculate how many peers signed off on the block, quorum was achieved when they make up the majority of voting weight
    multiSignatureQuorumReached(block) {
        const connectedPeers = Array.from(this.network.node.peers.peerManager.connectedNodes.keys());

        // Helper function to safely get the vote weight as a Decimal, accounting for null values
        const getVoteWeight = (nodeId) => {
            const voteWeight = this.network.ledger.getVoteWeight(nodeId);
            return voteWeight === undefined ? new Decimal(0) : new Decimal(voteWeight);  // Return Decimal(0) if voteWeight is null
        };

        // Calculate total online vote weight using a for loop
        let totalOnlineVoteWeight = new Decimal(0);
        for (let i = 0; i < connectedPeers.length; i++) {
            totalOnlineVoteWeight = totalOnlineVoteWeight.plus(getVoteWeight(connectedPeers[i]));
        }

        // Calculate total voted weight from block.validatorSignatures using a for loop
        let totalVotedWeight = new Decimal(0);
        const validatorSignatures = block.validatorSignatures;
        for (let sigNodeId in validatorSignatures) {
            totalVotedWeight = totalVotedWeight.plus(getVoteWeight(sigNodeId));
        }

        // Calculate the quorum threshold as a Decimal
        const quorumThreshold = new Decimal(this.quorumThreshold).times(totalOnlineVoteWeight);

        // Calculate the quorum percentage
        const quorumPercentage = totalVotedWeight.div(quorumThreshold).times(100);

        // Determine if quorum is achieved
        const quorumAchieved = totalVotedWeight.gte(quorumThreshold);  // Check if voted weight is greater than or equal to the threshold

        // Log the result with appropriate decimal precision
        if (quorumAchieved) {
            this.network.node.log(`Quorum achieved for block ${block.hash}. Voted Weight: ${totalVotedWeight.toString()}, Online Weight: ${totalOnlineVoteWeight.toString()}, Quorum Threshold: ${quorumThreshold.toString()}, Quorum Percentage: ${quorumPercentage.toFixed(2)}%.`);
        } else {
            this.network.node.log(`Quorum not achieved for block ${block.hash}. Voted Weight: ${totalVotedWeight.toString()}, Online Weight: ${totalOnlineVoteWeight.toString()}, Quorum Threshold: ${quorumThreshold.toString()}, Quorum Percentage: ${quorumPercentage.toFixed(2)}%.`);
        }

        return quorumAchieved;
    }
}

module.exports = ConsensusValidator;
