const BaseInstructionValidator = require('../../../../../core/system/instruction/base/baseinstructionvalidator');
const Hasher = require('../../../../../core/utils/hasher.js');

class VoteEndInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['voteend'] },
            proposalHash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            proposerAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            sourceNetworkId: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            finalScore: { type: 'string' },
            reward: { type: 'string' },
            targetType: { type: 'string', enum: ['createReward'] },
            targetNetwork: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' }
        }, [
            'type',
            'proposalHash',
            'proposerAccount',
            'sourceNetworkId',
            'finalScore',
            'reward',
            'targetType',
            'targetNetwork'
        ]);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;
        
        // Validate proposal exists and is active
        const proposalAccount = accountManager.getAccountUpdate(action.account);
        if (proposalAccount.unopenedAccount()) {
            return { state: 'PROPOSAL_NOT_EXISTENT' };
        }
        if (proposalAccount.getCustomProperty('status') === 'ended') {
            return { state: 'PROPOSAL_ENDED' };
        }
        if (proposalAccount.getCustomProperty('status') !== 'active') {
            return { state: 'PROPOSAL_NOT_ACTIVE' };
        }

        // Validate proposal expiration
        const proposalAction = this.network.ledger.getAction(instruction.proposalHash);
        if (proposalAction) {
            const currentTimestamp = Math.floor(Date.now() / 1000);
            const oneDayInSeconds = 60; //86400;
            if (currentTimestamp - Math.floor(parseInt(proposalAction.timestamp) / 1000) < oneDayInSeconds) {
                return { state: 'PROPOSAL_NOT_EXPIRED' };
            }
        }

        // Validate instruction data consistency
        const instructionResult = await this.validInstructionData(action, instruction);
        if (instructionResult.state !== 'VALID') {
            return instructionResult;
        }

        // Validate final results
        if (instruction.finalScore !== this.getFinalScore(action.account, accountManager)) {
            return { state: 'PEER_SCORE_MISMATCH' };
        }
        if (instruction.reward !== this.calculateReward(action.account, accountManager)) {
            return { state: 'PEER_REWARD_MISMATCH' };
        }

        return { state: 'VALID' };
    }

    // Helper methods remain the same but use instruction instead of action
    async validInstructionData(action, instruction) {
        if (!instruction.proposalHash) {
            return { state: 'INVALID_INSTRUCTION_HASH' };
        }
        
        const accountProposal = await Hasher.hashText(`proposalAccount(${instruction.proposalHash})`);
        const proposalAction = this.network.ledger.getAction(instruction.proposalHash);
        
        if (!proposalAction) return { state: 'INVALID_ACTION' };
        if (instruction.proposerAccount !== proposalAction.account) return { state: 'INVALID_PROPOSER_ACCOUNT' };
        if (action.account !== accountProposal) return { state: 'INVALID_ACCOUNT' };
        if (instruction.toAccount !== proposalAction.account) return { state: 'INVALID_TO_ACCOUNT' };
        if (action.delegator !== accountProposal) return { state: 'INVALID_DELEGATOR' };
        if (instruction.sourceNetworkId !== this.network.networkId) return { state: 'INVALID_SOURCE_NETWORK_ID' };
        
        return { state: 'VALID' };
    }

    getFinalScore(proposalAccountId, accountManager) {
        const proposalAccount = accountManager.getAccountUpdate(proposalAccountId);
        if(parseInt(proposalAccount.getCustomProperty('votes')) == 0) {
            return "0";
        }
        return (parseFloat(proposalAccount.getCustomProperty('totalVotingScore')) / parseFloat(proposalAccount.getCustomProperty('totalVotingPower'))).toFixed(2);
    }

    calculateReward(proposalAccountId, accountManager) {
        const proposalAccount = accountManager.getAccountUpdate(proposalAccountId);
        if(parseInt(proposalAccount.getCustomProperty('votes')) == 0) {
            return "0";
        }
        
        const voteScale = 10;
        const score = parseFloat(proposalAccount.getCustomProperty('totalVotingScore')) / parseFloat(proposalAccount.getCustomProperty('totalVotingPower'));
        return (score / voteScale).toFixed(2);
    }
}

module.exports = VoteEndInstructionValidator;
