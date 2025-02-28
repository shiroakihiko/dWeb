const BaseInstructionValidator = require('../../base/baseinstructionvalidator.js');
const ActionHelper = require('../../../../utils/actionhelper.js');
const Decimal = require('decimal.js');

class NetworkActionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        this.lastNetworkUpdateHeight = 0;
        this.updateInterval = 600; // 10 minutes
        this.minBalance = 0 * 100000000; // 0 DWEB // min balance requirements for network updates
        
        // Add network-specific schema properties
        this.addInstructionProperties({
            type: { type: 'string', enum: ['networkUpdate'] },
            crossNetworkAction: {
                instruction: {
                    type: 'object',
                    properties: {
                        toAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                        networkValidatorWeights: { type: 'object' },
                        networkHeight: { type: 'number' },
                        targetType: { type: 'string', enum: ['createReward'] },
                        targetNetworkAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                        targetNetwork: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' }
                    },
                    required: ['toAccount', 'networkValidatorWeights', 'networkHeight', 'targetType', 'targetNetworkAccount', 'targetNetwork']
                }
            }
        }, [
            'type', 'crossNetworkAction', 'crossNetworkValidation'
        ]);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;
        
        if(!this.validateActionData(action)) {
            return { state: 'INVALID_ACTION_DATA' };
        }
        if(!this.validateNetworkAccount(instruction.crossNetworkAction, accountManager)) {
            return { state: 'NETWORK_ACCOUNT_NOT_FOUND' };
        }
        if(!(await this.crossNetworkValidation(instruction.crossNetworkAction, instruction.crossNetworkValidation))) {
            return { state: 'NOT_SIGNED_BY_NETWORK' };
        }
        /*if(!this.validateMinBalance(instruction.crossNetworkAction, accountManager)) {
            return { state: 'MIN_BALANCE_NOT_MET' };
        }*/
        if(!this.validateNetworkWeightStructure(instruction.crossNetworkAction)) {
            return { state: 'INVALID_NETWORK_WEIGHT_STRUCTURE' };
        }
        if(!this.validNewHeight(instruction.crossNetworkAction, accountManager)) {
            return { state: 'TOO_EARLY' };
        }
        // Todo: reenable this
        /*if(!await this.dueForUpdate(instruction.crossNetworkAction, accountManager)) {
            return { state: 'NOT_DUE_FOR_UPDATE' };
        }*/
        return { state: 'VALID' };
    }

    async crossNetworkValidation(crossNetworkAction, crossNetworkValidation) {
        if(!(await this.sharedValidator.signedByNetwork(crossNetworkAction, crossNetworkValidation))) {
            return false;
        }
        return true;
    }

    validateActionData(action) {
        if(action.account !== action.instruction.crossNetworkAction.instruction.toAccount){ // Needs to be a self-send action on the network account
            this.network.node.warn('Invalid account for network update');
            return false;
        }
        if(action.instruction.crossNetworkAction.instruction.targetType !== 'networkUpdate'){
            this.network.node.warn('Invalid target type for network update');
            return false;
        }
        if(action.instruction.crossNetworkAction.instruction.targetNetwork !== this.network.networkId){
            this.network.node.warn('Invalid target network for network update');
            return false;
        }
        
        return true;
    }

    validateNetworkAccount(crossNetworkAction, accountManager) {
        const networkAccount = accountManager.getAccountUpdate(crossNetworkAction.instruction.toAccount);
        /*if(networkAccount.unopenedAccount()){
            this.network.node.warn('Network account not found for network update');
            return false;
        }*/
        
        // Verify we are the target network and not the source network of the update
        if(this.network.ledger.getGenesisAccount() === crossNetworkAction.instruction.toAccount){
            this.network.node.warn('Invalid network account for network update, cannot update self');
            return false;
        }
        
        return true;
    }

    validateMinBalance(crossNetworkAction, accountManager) {
        const networkAccount = accountManager.getAccountUpdate(crossNetworkAction.instruction.toAccount);
        if(new Decimal(networkAccount.getBalance()) > new Decimal(this.minBalance))
            return true;
        
        return false;
    }
    
    validNewHeight(crossNetworkAction, accountManager) {
        const networkAccount = accountManager.getAccountUpdate(crossNetworkAction.instruction.toAccount);
        if(!networkAccount.getCustomProperty('lastNetworkUpdateHeight'))
            return true;

        return crossNetworkAction.instruction.networkHeight > networkAccount.getCustomProperty('lastNetworkUpdateHeight') + 1; // +1 as the network instruction itself causes 1 action/block to be added
    }

    dueForUpdate(crossNetworkAction, accountManager) {
        const networkAccount = accountManager.getAccountUpdate(crossNetworkAction.instruction.toAccount);
        if(!networkAccount.getCustomProperty('lastNetworkUpdate'))
            return true;

        const timeSinceLastUpdate = crossNetworkAction.timestamp - networkAccount.getCustomProperty('lastNetworkUpdate');
        return timeSinceLastUpdate > this.updateInterval;
    }

    validateNetworkWeightStructure(crossNetworkAction) {
        const networkValidatorWeights = crossNetworkAction.instruction.networkValidatorWeights;

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
