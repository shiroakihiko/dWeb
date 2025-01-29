const BaseBlockValidator = require('../base/basevalidator');
const BlockHelper = require('../../utils/blockhelper.js');

class NetworkBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        this.lastNetworkUpdateHeight = 0;
        
        // Set validation checks explicitly
        this.setValidationChecks(['toAccount', 'hash']);
        this.setFinalValidationChecks([]);
        
        // Add network-specific schema properties
        this.addSchemaProperties({
            type: { type: 'string', enum: ['network'] },
            networkAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            data: { type: 'string', nullable: true },
            timestamp: { type: 'number' },
            networkValidatorWeights: { type: 'object' },
            networkHeight: { type: 'number' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }
        }, [
            'type', 'fromAccount', 'toAccount', 'networkAccount', 'amount', 'delegator',
            'timestamp', 'networkValidatorWeights',
            'networkHeight', 'signature'
        ]);

        this.setAdditionalProperties(false);

        // Add validation checks
        this.addBasicCheck(this.basicCheck.bind(this));
        this.addFinalCheck(this.finalCheck.bind(this));
        this.addConsensusCheck(this.consensusCheck.bind(this));
    }

    async basicCheck(block) {
        if(!await this.validateGenesisAccount(block.toAccount)) {
            return { state: 'ACCOUNT_NOT_FOUND' };
        }
        if(!this.validateNetworkWeightStructure(block)) {
            return { state: 'INVALID_NETWORK_WEIGHTS' };
        }
        if(!this.validData(block)) {
            return { state: 'INVALID_DATA' };
        }
        if(!await this.validNewHeight()) {
            return { state: 'TOO_EARLY' };
        }
        return { state: 'VALID' };
    }

    async finalCheck(block) {
        if(!await this.doValidatorWeightsMatch(block)) {
            return { state: 'VALIDATOR_WEIGHTS_MISMATCH' };
        }
        return { state: 'VALID' };
    }
    
    // This is a final consensus check required on the end state of a block
    async consensusCheck(block)
    {
        // #2 Validate the delegators time and necessary signatures for a network update
        const validNodeTimestampAndSignatures = await this.sharedValidator.validateBlock(block, ['timestamp', 'networkSigned'], this.blockSchema());
        if(validNodeTimestampAndSignatures.state != 'VALID')
            return validNodeTimestampAndSignatures;
        
        return { state: 'VALID' };
    }

    async validateGenesisAccount(genesisAccount) {
        const genesisAccountFromLedger = (await this.network.ledger.getContainerWithBlocks(this.network.networkId)).blocks[0].toAccount;
        if(!genesisAccountFromLedger)
            return false;
        
        return genesisAccount === genesisAccountFromLedger.fromAccount;
    }
    
    async validNewHeight() {
        let blockHeight = await this.network.ledger.getTotalBlockCount();
        return blockHeight > this.lastNetworkUpdateHeight;
    }

    async updateNewHeight() {
        this.lastNetworkUpdateHeight = await this.network.ledger.getTotalBlockCount();
    }

    async doValidatorWeightsMatch(block) {
        const blockWeights = block.networkValidatorWeights;
        const ledgerWeights = await this.network.ledger.getNetworkValidatorWeights();

        if (typeof blockWeights !== 'object' || blockWeights === null || 
            typeof ledgerWeights !== 'object' || ledgerWeights === null) {
            this.network.node.log("Both block and ledger weights should be objects.");
            return false;
        }

        const blockKeys = Object.keys(blockWeights);
        const ledgerKeys = Object.keys(ledgerWeights);

        if (blockKeys.length !== ledgerKeys.length) {
            this.network.node.log("The network validator weights objects have different key counts.");
            return false;
        }

        for (const key of blockKeys) {
            if (!ledgerWeights.hasOwnProperty(key)) {
                this.network.node.log(`Key ${key} is missing in the ledger weights.`);
                return false;
            }
            if (blockWeights[key] !== ledgerWeights[key]) {
                this.network.node.log(`Mismatch for key ${key}: Block Weight: ${blockWeights[key]}, Ledger Weight: ${ledgerWeights[key]}`);
                return false;
            }
        }

        this.network.node.log("Network validator weights match.");
        return true;
    }

    validateNetworkWeightStructure(block) {
        const networkValidatorWeights = block.networkValidatorWeights;

        if (typeof networkValidatorWeights !== 'object' || networkValidatorWeights === null || 
            Object.keys(networkValidatorWeights).length === 0) {
            return false;
        }

        let totalWeight = 0;
        for (const [nodeId, weight] of Object.entries(networkValidatorWeights)) {
            if (typeof nodeId !== 'string' || typeof weight !== 'number' || 
                weight < 0 || weight > 100 || !BlockHelper.isValidPublicKey(nodeId)) {
                return false;
            }
            totalWeight += weight;
        }

        return totalWeight > 90;
    }

    validData(block) {
        return block.toAccount === block.networkAccount;
    }
}

module.exports = NetworkBlockValidator;
