const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const Decimal = require('decimal.js');
const SharedValidator = require('../../../../../core/blockprocessors/shared/sharedvalidator.js');
const crypto = require('crypto');

class VoteEndBlockValidator {
    constructor(network) {
        this.network = network;
        this.sharedValidator = new SharedValidator(network);
    }

    // Method to validate the network update block using the schema and custom validation functions
    validate(block) {
        const validation = this.sharedValidator.validateBlock(block, ['fromAccount', 'toAccount', 'hash', 'previousBlockMatch'], this.blockSchema());

        if(validation.state != 'VALID')
            return validation;

        if(!this.proposalExist(block))
            return { state: 'PROPOSAL_NOT_EXISTENT' };

        if(this.proposalEnded(block))
            return { state: 'PROPOSAL_ENDED' };

        if(!this.activeProposal(block))
            return { state: 'PROPOSAL_NOT_ACTIVE' };
        
        if(!this.expiredProposal(block))
            return { state: 'PROPOSAL_NOT_EXPIRED' };
        
        if(!this.validBlockData(block))
            return { state: 'INVALID_BLOCK_DATA' };

        // Note: Vote end blocks are special and do not need the owners signature
        // if the majority of the validators signed off on the state change from "active" to "ended"

        return { state: 'VALID' };
    }
    
    // Consensus requirements that need to be met for a ledger entry
    validateFinal(block)
    {
        // #1 Check structure
        const basicCheck = this.validate(block);
        if(basicCheck.state != 'VALID')
            return basicCheck;
        
        // #2 Validate the delegators time
        const validNodeTimestamp = this.sharedValidator.validateBlock(block, ['timestamp'], this.blockSchema());
        if(validNodeTimestamp.state != 'VALID')
            return validNodeTimestamp;
        
        // #3 Reward and score match
        const finalResult = this.finalResultMatch(block);
        if(finalResult.state != 'VALID')
            return finalResult;

        return { state: 'VALID' };
    }

    proposalExist(block) {
        const proposalAccount = this.network.ledger.getAccount(block.fromAccount);
        if(proposalAccount) 
            return true;
        
        return false;
    }

    proposalEnded(block) {
        const proposalAccount = this.network.ledger.getAccount(block.fromAccount);
        if(proposalAccount && (proposalAccount.status == 'ended')) 
            return true;
        
        return false;
    }

    activeProposal(block) {
        const proposalAccount = this.network.ledger.getAccount(block.fromAccount);
        if(proposalAccount && (proposalAccount.status == 'active')) 
            return true;
        
        return false;
    }

    expiredProposal(block) {
        const proposalBlock = this.network.ledger.getBlock(block.proposalHash);
        if(proposalBlock)
        {
            // Get the current timestamp in seconds
            const currentTimestamp = Math.floor(Date.now() / 1000); 
            const oneDayInSeconds = 60; //86400; // 24 hours in seconds
            if (currentTimestamp - Math.floor(parseInt(proposalBlock.timestamp) / 1000) >= oneDayInSeconds)
            {
                return true;
            }
        }
        return false;
    }

    // Check for corrupt or invalid data
    validBlockData(block) {
        if(!block.proposalHash)
            return false;
        
        const proposalHash = block.proposalHash;
        const accountProposal = crypto.createHash('sha256').update(`proposalAccount(${proposalHash})`).digest('hex');
        const proposalBlock = this.network.ledger.getBlock(proposalHash);
        
        if(!proposalBlock)
            return false;
        const proposerAccount = proposalBlock.fromAccount;
        if(block.proposerAccount != proposerAccount) 
            return false;
        if(block.fromAccount != accountProposal) 
            return false;
        if(block.toAccount != proposerAccount) 
            return false;
        if(block.delegator != accountProposal) 
            return false;
        if(block.sourceNetworkId != this.network.networkId) 
            return false;
        
        return true;
    }

    // Schema definition for NetworkBlock
    blockSchema() {
        return {
            type: 'object',
            properties: {
                type: { type: 'string', enum: ['voteend'] },
                fromAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                toAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                networkAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                amount: { type: 'number' }, // Network amount is generally 0
                delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' }, // Delegator account
                previousBlockSender: { type: 'string', nullable: true },
                previousBlockRecipient: { type: 'string', nullable: true },
                previousBlockDelegator: { type: 'string', nullable: true },
                data: { type: 'string', nullable: true }, // Optional additional data
                proposalHash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                proposerAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                sourceNetworkId: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                timestamp: { type: 'number' },
                //hash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },  // Ensure hash is a valid hex string
                fee: { type: 'number' },  // Fee is generally 0
                finalScore: { type: 'string' },
                reward: { type: 'string' },
                signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }, // Base64 pattern
                //validatorSignatures: { type: 'object' }
            },
            required: [
                'type', 'fromAccount', 'toAccount', 'networkAccount', 'amount', 'delegator',
                'previousBlockSender', 'previousBlockRecipient', 'previousBlockDelegator',
                'proposalHash', 'proposerAccount', 'sourceNetworkId', 'timestamp', 'fee',
                'finalScore', 'reward', 'signature', //'hash', 'validatorSignatures'
            ],
            additionalProperties: false
        };
    }


    // ------- Additional consensus validation
   
    finalResultMatch(block)
    {
        const proposalScore = block.finalScore;
        const proposalReward = block.reward; 
        
        // Validate score and reward against block
        if(proposalScore != this.getFinalScore(block.fromAccount))
            return { state: 'PEER_SCORE_MISMATCH' };
        if(proposalReward != this.calculateReward(block.fromAccount))
            return { state: 'PEER_REWARD_MISMATCH' };
        
        return { state: 'VALID' };
    }

    getFinalScore(proposalAccountId) {
        const proposalAccount = this.network.ledger.getAccount(proposalAccountId);
        if(parseInt(proposalAccount.votes) == 0)
            return "0";
        
        return (parseFloat(proposalAccount.totalVotingScore) / parseFloat(proposalAccount.totalVotingPower)).toFixed(2);
    }

    // Normalized reward of the final scare on the vote scale (-10,+10) = (-1,1)
    calculateReward(proposalAccountId) {
        const proposalAccount = this.network.ledger.getAccount(proposalAccountId);
        if(parseInt(proposalAccount.votes) == 0)
            return "0";
        
        const voteScale = 10;
        const score = parseFloat(proposalAccount.totalVotingScore) / parseFloat(proposalAccount.totalVotingPower);
        return (score / voteScale).toFixed(2);
    }
    getGenesisAccount() {
        return this.network.ledger.getBlock(this.network.networkId).toAccount;
    }
}

module.exports = VoteEndBlockValidator;
