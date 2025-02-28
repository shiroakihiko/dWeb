const IInstruction = require('../../../../interfaces/iinstruction.js');
const RewardInstructionValidator = require('./validator.js');
const RewardInstructionProcessor = require('./processor.js');
const Hasher = require('../../../../../utils/hasher');
const ConfigHandler = require('../../../../../utils/confighandler');

class RewardInstruction extends IInstruction {
    constructor(network) {
        super(network);
        this.validator = new RewardInstructionValidator(network);
        this.processor = new RewardInstructionProcessor(network);
        this.baseReward = 1;
    }

   async createInstruction(params) {
        const rawReward = this.baseReward * 100000000;
        const targetNetwork = ConfigHandler.getNetworkById(this.network.networkId).rewardTargetNetwork;

        const instruction = {
            type: 'reward',
            toAccount: params.crossNetworkAction.instruction.proposerAccount,
            amount: rawReward * parseFloat(params.crossNetworkAction.instruction.reward),
            crossNetworkAction: params.crossNetworkAction,
            crossNetworkValidation: params.crossNetworkValidation
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

module.exports = RewardInstruction;