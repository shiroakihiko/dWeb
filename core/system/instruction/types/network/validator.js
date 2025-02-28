const BaseInstructionValidator = require('../../base/baseinstructionvalidator.js');
const ActionHelper = require('../../../../utils/actionhelper.js');

class NetworkActionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.lastNetworkUpdateHeight = 0;
        this.updateInterval = 600; // 10 minutes
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['network'] },
            networkValidatorWeights: { type: 'object' },
            networkHeight: { type: 'number' }
        }, [
            'type',
            'networkValidatorWeights',
            'networkHeight'
        ]);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;

        if(!this.validateGenesisAccount(action, instruction)) {
            return { state: 'GENESIS_ACCOUNT_MISMATCH' };
        }
        if(!this.validateNetworkWeightStructure(instruction)) {
            return { state: 'INVALID_NETWORK_WEIGHTS' };
        }
        // Todo: reenable this
        /*if(!await this.validNewHeight(instruction, accountManager)) {
            return { state: 'TOO_EARLY' };
        }
        if(!await this.dueForUpdate(instruction, accountManager)) {
            return { state: 'NOT_DUE_FOR_UPDATE' };
        }*/
        if(!this.doValidatorWeightsMatch(instruction)) {
            return { state: 'VALIDATOR_WEIGHTS_MISMATCH' };
        }
        return { state: 'VALID' };
    }

    validateGenesisAccount(action, instruction) {
        const genesisAccountFromLedger = this.network.ledger.getGenesisAccount();
        if(!genesisAccountFromLedger)
            return false;
        if(action.account !== instruction.toAccount) // Needs to be a self-send action on the network account
            return false;
        
        const networkAccount = action.account;
        return networkAccount === genesisAccountFromLedger;
    }
    
    validNewHeight(instruction, accountManager) {
        let currentHeight = this.network.ledger.getTotalBlockCount();
        const lastNetworkUpdateHeight = accountManager.getAccountUpdate(instruction.toAccount);
        if(!lastNetworkUpdateHeight.getCustomProperty('lastNetworkUpdateHeight'))
            return true;

        return currentHeight > lastNetworkUpdateHeight.getCustomProperty('lastNetworkUpdateHeight') + 1; // +1 as the network instruction itself causes 1 action/block to be added
    }

    dueForUpdate(instruction, accountManager) {
        const lastNetworkUpdateTimestamp = accountManager.getAccountUpdate(instruction.toAccount);
        if(!lastNetworkUpdateTimestamp.getCustomProperty('lastNetworkUpdate'))
            return true;

        const timeSinceLastUpdate = instruction.timestamp - lastNetworkUpdateTimestamp.getCustomProperty('lastNetworkUpdate');
        return timeSinceLastUpdate > this.updateInterval;
    }

    doValidatorWeightsMatch(instruction) {
        const instructionWeights = instruction.networkValidatorWeights;
        const ledgerWeights = this.network.ledger.getNetworkValidatorWeights();

        if (typeof instructionWeights !== 'object' || instructionWeights === null || 
            typeof ledgerWeights !== 'object' || ledgerWeights === null) {
            this.network.node.log("Both instruction and ledger weights should be objects.");
            return false;
        }

        const instructionKeys = Object.keys(instructionWeights);
        const ledgerKeys = Object.keys(ledgerWeights);

        if (instructionKeys.length !== ledgerKeys.length) {
            this.network.node.log("The network validator weights objects have different key counts.");
            return false;
        }

        for (const key of instructionKeys) {
            if (!ledgerWeights.hasOwnProperty(key)) {
                this.network.node.log(`Key ${key} is missing in the ledger weights.`);
                return false;
            }
            if (instructionWeights[key] !== ledgerWeights[key]) {
                this.network.node.log(`Mismatch for key ${key}: Instruction Weight: ${instructionWeights[key]}, Ledger Weight: ${ledgerWeights[key]}`);
                return false;
            }
        }

        this.network.node.log("Network validator weights match.");
        return true;
    }

    validateNetworkWeightStructure(instruction) {
        const networkValidatorWeights = instruction.networkValidatorWeights;

        if (typeof networkValidatorWeights !== 'object' || networkValidatorWeights === null || 
            Object.keys(networkValidatorWeights).length === 0) {
            return false;
        }

        let totalWeight = 0;
        for (const [nodeId, weight] of Object.entries(networkValidatorWeights)) {
            if (typeof nodeId !== 'string' || typeof weight !== 'string' || 
                parseFloat(weight) < 0 || parseFloat(weight) > 100 || !ActionHelper.isValidPublicKey(nodeId)) {
                return false;
            }
            totalWeight += parseFloat(weight);
        }

        return totalWeight > 90;
    }
}

module.exports = NetworkActionValidator;
