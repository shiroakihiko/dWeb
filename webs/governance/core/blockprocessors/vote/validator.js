const Ajv = require('ajv');
const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const Decimal = require('decimal.js');
const BlockFeeCalculator = require('../../../../../core/blockprocessors/shared/feecalculator.js');
const SharedValidator = require('../../../../../core/blockprocessors/shared/sharedvalidator.js');

class VoteBlockValidator {
    constructor(network) {
        this.network = network;
        this.sharedValidator = new SharedValidator(network);
        // Initialize the FeeDistributionCalculator class
        this.feeCalculator = new BlockFeeCalculator(network);
    }

    // Method to validate the send block using the schema and custom validation functions
    validate(block) {
        // Do the basic check first so there's no need for schema and undefined property checking afterwards
        // 'fee', 
        const basicCheck = this.sharedValidator.validateBlock(block, ['fromAccount', 'toAccount', 'delegator', 'previousBlockMatch', 'signature'], this.blockSchema());
        if(basicCheck.state != 'VALID')
            return basicCheck;
        
        if(!this.votingRights(block))
            return { state: 'NO_VOTING_POWER' };
        if(!this.activeProposal(block))
            return { state: 'INVALID_PROPOSAL' };
        if(!this.validScore(block))
            return { state: 'INVALID_SCORE' };
        //if(!this.alreadyVoted(block))
        //    return { state: 'ALREADY_VOTED' };
            
        return { state: 'VALID' };
    }

    // Final validation prior ledger entry
    validateFinal(block)
    {
        // Do the basic check first so there's no need for schema and undefined property checking afterwards
        // 'fee', 
        const basicCheck = this.sharedValidator.validateBlock(block, ['timestamp', 'hash', 'fromAccount', 'toAccount', 'delegator', 'previousBlockMatch', 'signature'], this.blockSchema());
        if(basicCheck.state != 'VALID')
            return basicCheck;
        
        if(!this.votingRights(block))
            return { state: 'NO_VOTING_POWER' };
        if(!this.activeProposal(block))
            return { state: 'INVALID_PROPOSAL' };
        if(!this.validScore(block))
            return { state: 'INVALID_SCORE' };
        //if(!this.alreadyVoted(block))
        //    return { state: 'ALREADY_VOTED' };
            
        return { state: 'VALID' };
    }

    // Custom validation to ensure that the voter has voting power (voting rights)
    votingRights(block) {
        const voterAccount = this.network.ledger.getAccount(block.fromAccount);
        if(voterAccount && parseFloat(voterAccount.votingPower) > 0)
            return true;
        
        return false;
    }
    activeProposal(block) {
        const proposalAccount = this.network.ledger.getAccount(block.toAccount);
        if(proposalAccount && (proposalAccount.status == 'active')) 
            return true;
        
        return false;
    }
    validScore(block) {
        if(parseFloat(block.score) >= -10 && parseFloat(block.score) <= 10)
            return true;
        
        return false;
    }
    alreadyVoted(block) {
        const proposalAccount = this.network.ledger.getAccount(block.toAccount);
        const proposalEntries = this.network.ledger.getTransactions(block.toAccount);
        
        let votedBefore = false;
        for(const entry of proposalEntries)
        {
            if(entry.type == 'vote' && entry.fromAccount == block.fromAccount)
                votedBefore = true;
        }
        
        return votedBefore;
    }


    // Schema definition for SendBlock
    blockSchema() {
        return {
            type: 'object',
            properties: {
                type: { type: 'string', enum: ['vote'] },
                fromAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                toAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                amount: { type: ['string', 'number'] },
                delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', nullable: true },
                previousBlockSender: { type: 'string', nullable: true },
                previousBlockRecipient: { type: 'string', nullable: true },
                previousBlockDelegator: { type: 'string', nullable: true },
                score: { type: 'string' },
                power: { type: 'string' },
                timestamp: { type: 'number' },
                //hash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },  // Ensure hash is a valid hex string
                fee: { type: 'string' },
                delegatorReward: { type: 'string' },
                burnAmount: { type: 'string' },
                signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }, // Base64 pattern
                //validatorSignatures: { type: 'object' }
            },
            required: [
                'type', 'fromAccount', 'toAccount', 'amount', 'delegator',
                'previousBlockSender', 'previousBlockRecipient', 'previousBlockDelegator',
                'score', 'timestamp', 'fee', 'delegatorReward', 'burnAmount',
                'signature',// 'hash', 'validatorSignatures'
            ],
            additionalProperties: false
        };
    }
}

module.exports = VoteBlockValidator;
