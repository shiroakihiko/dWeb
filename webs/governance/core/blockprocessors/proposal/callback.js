const Ajv = require('ajv');
const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const Decimal = require('decimal.js');
const BlockFeeCalculator = require('../../../../../core/blockprocessors/shared/feecalculator.js');
const SharedValidator = require('../../../../../core/blockprocessors/shared/sharedvalidator.js');
const VoteEndBlockProcessor = require('../voteend/voteend.js');
const crypto = require('crypto');

class ProposalBlockCallback {
    constructor(network) {
        this.network = network;
        this.sharedValidator = new SharedValidator(network);
        // Initialize the FeeDistributionCalculator class
        this.feeCalculator = new BlockFeeCalculator(network);
    }

    // Method to validate the send block using the schema and custom validation functions
    blockCallback(block) {
        const proposalHash = block.hash;
        // Get the current timestamp in seconds
        const currentTimestamp = Math.floor(Date.now() / 1000); // Convert milliseconds to seconds
        const oneDayInSeconds = 60;//86400; // 24 hours in seconds
        if (currentTimestamp - Math.floor(parseInt(block.timestamp) / 1000) >= oneDayInSeconds)
        {
            // 24 hours passed
            // Create a new vote-end block that ends a proposal and takes care of the rewarding
            const voteEnd = new VoteEndBlockProcessor(this.network);
            const newBlock = voteEnd.createNewBlock(proposalHash);
            if(newBlock.state == 'PROPOSAL_ENDED')
            {
                // The network already sent and confirmed a vote-end block
                // Use the existing end block with the validator signatures from the ledger
                const accountProposal = crypto.createHash('sha256').update(`proposalAccount(${proposalHash})`).digest('hex');
                this.notifyTargetNetwork(this.network.ledger.getLastBlockByType('voteend', accountProposal));
                this.network.ledger.blockCallbacks.removeCallback(proposalHash);
            }
            else if(newBlock.state == 'VALID')
            {
                this.network.consensus.proposeBlock(newBlock.block, ()=>{
                    this.network.ledger.blockCallbacks.removeCallback(proposalHash);
                    this.notifyTargetNetwork(newBlock.block);
                });
            }
            return true; 
        }
        else
        {
            return false; // Nothing to do yet
        }
    }
    
    notifyTargetNetwork(voteEndBlock)
    {
        if(!this.network.node)
            return;
        
        const proposalHash = voteEndBlock.proposalHash;
        const proposalBlock = this.network.ledger.getBlock(proposalHash);
        const targetNetworkId = proposalBlock.toAccount;
        
        // The voteend contains the final voting results that all delegators signed off on
        // Send a reward block to the target network and let it decides what to do with it
        
        const networkMessage = {};
        networkMessage.type = 'createReward';
        networkMessage.consensusBlock = voteEndBlock; // The voteend block with the final result that delegators agreed on
        networkMessage.timestamp = Date.now();
        
        this.network.node.log(`Proposal ${proposalHash} ended. Cross network message with block (${voteEndBlock.hash}) to network ${targetNetworkId}!`);
        try
        {
            this.network.node.sendTargetNetwork(targetNetworkId, networkMessage, null);
        }
        catch(error)
        {
            this.network.node.error(error);
        }
    }
}

module.exports = ProposalBlockCallback;