const IInstruction = require('../../../interfaces/iinstruction.js');
const NetworkInstructionValidator = require('./validator.js');
const NetworkInstructionProcessor = require('./processor.js');
const ConfigHandler = require('../../../../utils/confighandler.js');
const Hasher = require('../../../../utils/hasher.js');

class NetworkInstruction extends IInstruction {
    constructor(network) {
        super(network);
        
        // Create instruction-specific processors
        this.validator = new NetworkInstructionValidator(network);
        this.processor = new NetworkInstructionProcessor(network);
    }

    // Create network-specific instruction
   async createInstruction(params) {
        const networkAccount = this.network.ledger.getGenesisAccount();
        //const targetNetwork = ConfigHandler.getNetworkById(this.network.networkId).dWebNetworkId;
        const targetNetwork = ConfigHandler.getNetwork('finance', 'finance-testnet').networkId;

        const instruction = {
            type: 'network',
            toAccount: networkAccount,
            amount: 0,
            networkValidatorWeights: this.network.ledger.getNetworkValidatorWeights(),
            networkHeight: this.network.ledger.getTotalBlockCount(),
            // Cross-network instruction
            targetType: 'networkUpdate',
            targetNetwork: targetNetwork,
            targetNetworkAccount: networkAccount
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

module.exports = NetworkInstruction;