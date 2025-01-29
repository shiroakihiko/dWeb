const BaseBlockValidator = require('../../../../../core/blockprocessors/base/basevalidator');

class VoteBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        // Set validation checks explicitly
        this.setValidationChecks(['fromAccount', 'toAccount', 'delegator', 'signature']);
        this.setFinalValidationChecks(['timestamp', 'hash']);
        
        // Add vote-specific schema properties
        this.addSchemaProperties({
            type: { type: 'string', enum: ['vote'] },
            score: { type: 'string' },
            power: { type: 'string' },
            delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', nullable: true },
            timestamp: { type: 'number' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }
        }, [
            'type', 'score', 'delegator', 'timestamp', 'signature'
        ]);

        this.setAdditionalProperties(false);

        this.addBasicCheck(this.basicCheck.bind(this));
        this.addFinalCheck(this.finalCheck.bind(this));
    }

    async basicCheck(block) {
        if(!(await this.votingRights(block))) {
            return { state: 'NO_VOTING_POWER' };
        }
        if(!(await this.activeProposal(block))) {
            return { state: 'INVALID_PROPOSAL' };
        }
        if(!(await this.validScore(block))) {
            return { state: 'INVALID_SCORE' };
        }
        //if(!this.alreadyVoted(block))
        //    return { state: 'ALREADY_VOTED' };
        return { state: 'VALID' };
    }

    async finalCheck(block) {
        return await this.basicCheck(block);
    }

    async votingRights(block) {
        const voterAccount = await this.network.ledger.getAccount(block.fromAccount);
        if(voterAccount && parseFloat(voterAccount.votingPower) > 0) {
            return true;
        }
        return false;
    }

    async activeProposal(block) {
        const proposalAccount = await this.network.ledger.getAccount(block.toAccount);
        if(proposalAccount && (proposalAccount.status == 'active')) {
            return true;
        }
        return false;
    }

    async validScore(block) {
        if(parseFloat(block.score) >= -10 && parseFloat(block.score) <= 10) {
            return true;
        }
        return false;
    }
    
    async alreadyVoted(block) {
        const proposalAccount = await this.network.ledger.getAccount(block.toAccount);
        const proposalEntries = await this.network.ledger.getAccountHistory(block.toAccount);
        
        let votedBefore = false;
        for(const entry of proposalEntries)
        {
            if(entry.type == 'vote' && entry.fromAccount == block.fromAccount)
                votedBefore = true;
        }
        
        return votedBefore;
    }
}

module.exports = VoteBlockValidator;
