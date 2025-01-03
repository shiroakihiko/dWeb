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
        this.lastCallTime = false;
    }

    // Callback on the proposal block that ends it and passes on the final results to the target network
    blockCallback(block) {
        const proposalHash = block.hash;
        const proposalAccount = crypto.createHash('sha256').update(`proposalAccount(${proposalHash})`).digest('hex');
        // Get the current timestamp in seconds
        const currentTimestamp = Math.floor(Date.now() / 1000); // Convert milliseconds to seconds
        const oneDayInSeconds = 60;//86400; // 24 hours in seconds

        // 24 hours passed
        if (currentTimestamp - Math.floor(parseInt(block.timestamp) / 1000) >= oneDayInSeconds)
        {
            if(this.network.ledger.getAccount(proposalAccount).status == 'ended')
            {
                this.network.ledger.blockCallbacks.removeCallback(proposalHash);
                return true;
            }
            
            if(this.lastCallTime === false || (currentTimestamp - this.lastCallTime) > 60)
            {
                this.lastCallTime = currentTimestamp;
                
                // Create a new vote-end block that ends a proposal
                const voteEnd = new VoteEndBlockProcessor(this.network);
                const newBlock = voteEnd.createNewBlock(proposalHash);
                console.log(newBlock.state);
                if(newBlock.state == 'PROPOSAL_ENDED')
                {
                    // The network already sent and confirmed a vote-end block
                    // Use the existing end block with the validator signatures from the ledger
                    const ledgerVoteEndBlock = this.network.ledger.getLastBlockByType('voteend', proposalAccount);
                    this.notifyTargetNetwork(ledgerVoteEndBlock);
                }
                else if(newBlock.state == 'VALID')
                {
                    this.network.consensus.proposeBlock(newBlock.block, (confirmedBlock)=>{
                        this.network.ledger.blockCallbacks.removeCallback(proposalHash);
                        if(confirmedBlock)
                            this.notifyTargetNetwork(confirmedBlock);
                    });
                }
                return true; 
            }
        }
        else
        {
            return false; // Nothing to do yet
        }
    }
    
    notifyTargetNetwork(voteEndBlock)
    {
        if(!voteEndBlock)
            return;
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