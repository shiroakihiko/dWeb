const BaseBlockValidator = require('../../../../../core/blockprocessors/base/basevalidator');
const crypto = require('crypto');

class VoteEndBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        // Set validation checks explicitly
        this.setValidationChecks(['fromAccount', 'toAccount', 'hash']);
        this.setFinalValidationChecks(['timestamp']);
        
        // Add voteend-specific schema properties
        this.addSchemaProperties({
            type: { type: 'string', enum: ['voteend'] },
            networkAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            data: { type: 'string', nullable: true },
            proposalHash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            proposerAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            sourceNetworkId: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            timestamp: { type: 'number' },
            finalScore: { type: 'string' },
            reward: { type: 'string' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }
        }, [
            'type', 'fromAccount', 'toAccount', 'networkAccount', 'delegator',
            'proposalHash', 'proposerAccount', 'sourceNetworkId', 'timestamp',
            'finalScore', 'reward', 'signature'
        ]);

        this.setAdditionalProperties(false);

        // Bind methods and add checks
        this.addBasicCheck(this.basicCheck.bind(this));
        this.addFinalCheck(this.finalCheck.bind(this));
    }

    async basicCheck(block) {
        if(!await this.proposalExist(block)) {
            return { state: 'PROPOSAL_NOT_EXISTENT' };
        }
        if(await this.proposalEnded(block)) {
            return { state: 'PROPOSAL_ENDED' };
        }
        if(!await this.activeProposal(block)) {
            return { state: 'PROPOSAL_NOT_ACTIVE' };
        }
        if(!await this.expiredProposal(block)) {
            return { state: 'PROPOSAL_NOT_EXPIRED' };
        }
        if(!await this.validBlockData(block)) {
            return { state: 'INVALID_BLOCK_DATA' };
        }
        return { state: 'VALID' };
    }

    async finalCheck(block) {
        const finalResult = await this.finalResultMatch(block);
        if(finalResult.state != 'VALID') {
            return finalResult;
        }
        return { state: 'VALID' };
    }

    async proposalExist(block) {
        const proposalAccount = await this.network.ledger.getAccount(block.fromAccount);
        if(proposalAccount) {
            return true;
        }
        return false;
    }

    async proposalEnded(block) {
        const proposalAccount = await this.network.ledger.getAccount(block.fromAccount);
        if(proposalAccount && (proposalAccount.status == 'ended')) {
            return true;
        }
        return false;
    }

    async activeProposal(block) {
        const proposalAccount = await this.network.ledger.getAccount(block.fromAccount);
        if(proposalAccount && (proposalAccount.status == 'active')) {
            return true;
        }
        return false;
    }

    async expiredProposal(block) {
        const proposalBlock = await this.network.ledger.getBlock(block.proposalHash);
        if(proposalBlock) {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const oneDayInSeconds = 60; //86400;
            if (currentTimestamp - Math.floor(parseInt(proposalBlock.timestamp) / 1000) >= oneDayInSeconds) {
                return true;
            }
        }
        return false;
    }

    async validBlockData(block) {
        if(!block.proposalHash) {
            return false;
        }
        
        const proposalHash = block.proposalHash;
        const accountProposal = crypto.createHash('sha256').update(`proposalAccount(${proposalHash})`).digest('hex');
        const proposalBlock = await this.network.ledger.getBlock(proposalHash);
        
        if(!proposalBlock) {
            return false;
        }
        const proposerAccount = proposalBlock.fromAccount;
        if(block.proposerAccount != proposerAccount) {
            return false;
        }
        if(block.fromAccount != accountProposal) {
            return false;
        }
        if(block.toAccount != proposerAccount) {
            return false;
        }
        if(block.delegator != accountProposal) {
            return false;
        }
        if(block.sourceNetworkId != this.network.networkId) {
            return false;
        }
        
        return true;
    }

    async finalResultMatch(block) {
        const proposalScore = block.finalScore;
        const proposalReward = block.reward;
        
        if(proposalScore != await this.getFinalScore(block.fromAccount)) {
            return { state: 'PEER_SCORE_MISMATCH' };
        }
        if(proposalReward != await this.calculateReward(block.fromAccount)) {
            return { state: 'PEER_REWARD_MISMATCH' };
        }
        
        return { state: 'VALID' };
    }

    async getFinalScore(proposalAccountId) {
        const proposalAccount = await this.network.ledger.getAccount(proposalAccountId);
        if(parseInt(proposalAccount.votes) == 0) {
            return "0";
        }
        return (parseFloat(proposalAccount.totalVotingScore) / parseFloat(proposalAccount.totalVotingPower)).toFixed(2);
    }

    async calculateReward(proposalAccountId) {
        const proposalAccount = await this.network.ledger.getAccount(proposalAccountId);
        if(parseInt(proposalAccount.votes) == 0) {
            return "0";
        }
        
        const voteScale = 10;
        const score = parseFloat(proposalAccount.totalVotingScore) / parseFloat(proposalAccount.totalVotingPower);
        return (score / voteScale).toFixed(2);
    }
}

module.exports = VoteEndBlockValidator;
