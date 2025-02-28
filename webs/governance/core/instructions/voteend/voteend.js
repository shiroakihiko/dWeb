const IInstruction = require('../../../../../core/system/interfaces/iinstruction');
const VoteEndInstructionValidator = require('./validator.js');
const VoteEndInstructionProcessor = require('./processor.js');
const Hasher = require('../../../../../core/utils/hasher.js');
const AccountUpdateManager = require('../../../../../core/ledger/account/accountupdatemanager.js');

class VoteEndInstruction extends IInstruction {
    constructor(network) {
        super(network);
        this.validator = new VoteEndInstructionValidator(network);
        this.processor = new VoteEndInstructionProcessor(network);
    }

   async createInstruction(params) {
        const proposalAccount = await Hasher.hashText(`proposalAccount(${params.proposalHash})`);
        const proposerAccount = (this.network.ledger.getAction(params.proposalHash)).account;
        const targetNetworkId = (this.network.ledger.getAction(params.proposalHash)).instruction.toAccount;
        const accountManager = new AccountUpdateManager(this.network.ledger);

        const instruction = {
            type: 'voteend',
            toAccount: proposerAccount,
            sourceNetworkId: this.network.networkId,
            proposalHash: params.proposalHash,
            proposerAccount: proposerAccount,
            finalScore: this.validator.getFinalScore(proposalAccount, accountManager),
            reward: this.validator.calculateReward(proposalAccount, accountManager),
            // Cross network message requirements
            targetType: 'createReward',
            targetNetwork: targetNetworkId,
            targetNetworkAccount: this.network.ledger.getGenesisAccount()
        };
        
        return instruction;
    }

    async validateInstruction(validationData) {
        return await this.validator.validateInstruction(validationData);
    }

    async processInstruction(processData) {
        return await this.processor.processInstruction(processData);
    }
}

module.exports = VoteEndInstruction;
