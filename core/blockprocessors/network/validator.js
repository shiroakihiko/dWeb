const BlockHelper = require('../../utils/blockhelper.js');
const Decimal = require('decimal.js');
const SharedValidator = require('../shared/sharedvalidator.js');

class NetworkBlockValidator {
    
    constructor(network) {
        this.network = network;
        this.sharedValidator = new SharedValidator(network);
        this.lastNetworkUpdateHeight = 0;
    }

    // Method to validate the network update block using the schema and custom validation functions
    validate(block) {
        const validation = this.sharedValidator.validateBlock(block, ['toAccount', 'hash'], this.blockSchema());
        if(validation.state != 'VALID')
            return validation;

        if(!this.validateGenesisAccount(block.toAccount))
            return { state: 'ACCOUNT_NOT_FOUND' };

        if(!this.validPreviousBlock(block))
            return { state: 'PREVIOUS_BLOCK_MISMATCH' };

        if(!this.validateNetworkWeightStructure(block))
            return { state: 'INVALID_NETWORK_WEIGHTS' };

        if(!this.validData(block))
            return { state: 'INVALID_DATA' };
        
        if(!this.validNewHeight())
            return { state: 'TOO_EARLY' };

        // Note: Network blocks are special and do not need the owners signature
        // if the majority of the declared nodes signed off on the change

        return { state: 'VALID' };
    }

    // Consensus requirements that need to be met for a ledger entry
    validateFinal(block)
    {
        // #1 Check structure
        const validStructure = this.validate(block);
        if(validStructure.state != 'VALID')
            return validStructure;
        if(!this.doValidatorWeightsMatch(block))
            return { state: 'VALIDATOR_WEIGHTS_MISMATCH' };

        return { state: 'VALID' };
    }
    
    // This is a final consensus check required on the end state of a block
    validBlockFinalization(block)
    {
        // #2 Validate the delegators time and necessary signatures for a network update
        const validNodeTimestampAndSignatures = this.sharedValidator.validateBlock(block, ['timestamp', 'networkSigned'], this.blockSchema());
        if(validNodeTimestampAndSignatures.state != 'VALID')
            return validNodeTimestampAndSignatures;
        
        return { state: 'VALID' };
    }

    // Custom validation to ensure that the genesis account exists
    validateGenesisAccount(genesisAccount) {
        const genesisAccountFromLedger = this.network.ledger.getBlock(this.network.networkId).fromAccount;
        if (genesisAccount !== genesisAccountFromLedger)
            return false;

        return true;
    }
    
    // Make sure we have confirmed any new blocks since the last network update that justify an update
    validNewHeight()
    {
        let blockHeight = this.network.ledger.getTotalBlockCount();
        if(blockHeight <= this.lastNetworkUpdateHeight)
            return false;
        
        return true;
    }
    // Called from the ledger adder
    updateNewHeight()
    {
        let blockHeight = this.network.ledger.getTotalBlockCount();
        this.lastNetworkUpdateHeight = blockHeight;
    }

    // Custom validation to ensure that the previous block hash is valid
    validPreviousBlock(block) {
        return this.network.ledger.getLastBlockHash(block.toAccount) === block.previousBlock;
    }

    // Custom validation for networkValidatorWeights field
    validateNetworkWeightStructure(block) {
        const networkValidatorWeights = block.networkValidatorWeights;

        // Check if the networkValidatorWeights is an object and not empty
        if (typeof networkValidatorWeights !== 'object' || networkValidatorWeights === null || Object.keys(networkValidatorWeights).length === 0)
            return false;

        // Check if each key-value pair in networkValidatorWeights is valid (key is a string, value is a number)
        for (const [key, value] of Object.entries(networkValidatorWeights)) {
            if (typeof key !== 'string')
                return false;

            if (typeof value !== 'number')
                return false;
        }

        // Check that total weight of declared nodes make up at leat 90%
        let totalWeight = 0;
        for (let nodeId in networkValidatorWeights) {
            if (networkValidatorWeights.hasOwnProperty(nodeId)) {
                const weight = networkValidatorWeights[nodeId];
                if (typeof weight !== 'number' || weight < 0 || weight > 100 || !BlockHelper.isValidPublicKey(nodeId)) {
                    return false;
                }
                totalWeight += weight;
            }
        }
        if(totalWeight <= 90)
            return false;

        return true;
    }

    // Schema definition for NetworkBlock
    blockSchema() {
        return {
            type: 'object',
            properties: {
                type: { type: 'string', enum: ['network'] },
                fromAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                toAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                networkAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                amount: { type: 'number' }, // Network amount is generally 0
                delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' }, // Delegator account
                previousBlock: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                data: { type: 'string', nullable: true }, // Optional additional data
                timestamp: { type: 'number' },
                //hash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },  // Ensure hash is a valid hex string
                fee: { type: 'number' },  // Fee is generally 0
                networkValidatorWeights: { type: 'object' },  // Custom field
                networkHeight: { type: 'number' },
                signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }, // Base64 pattern
                //validatorSignatures: { type: 'object' }
            },
            required: [
                'type', 'fromAccount', 'toAccount', 'networkAccount', 'amount', 'delegator',
                'previousBlock', 'timestamp', 'fee', 'networkValidatorWeights',
                'networkHeight', 'signature', //'hash', 'validatorSignatures'
            ],
            additionalProperties: false
        };
    }

    validData(block) {
        if(block.toAccount != block.networkAccount)
            return false;
        
        return true;
    }


    // Function to compare the network validator weights of a block with the current ledger's weights
    doValidatorWeightsMatch(block) {
        // Get the network validator weights from both the block and the networks ledger
        const blockWeights = block.networkValidatorWeights;
        const ledgerWeights = this.network.ledger.getNetworkValidatorWeights();

        // Ensure both blockWeights and ledgerWeights are objects
        if (typeof blockWeights !== 'object' || blockWeights === null || typeof ledgerWeights !== 'object' || ledgerWeights === null) {
            this.network.node.log("Both block and ledger weights should be objects.");
            return false;
        }

        // Check if both objects have the same keys
        const blockKeys = Object.keys(blockWeights);
        const ledgerKeys = Object.keys(ledgerWeights);

        if (blockKeys.length !== ledgerKeys.length) {
            this.network.node.log("The network validator weights objects have different key counts.");
            return false;
        }

        // Compare each key-value pair
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

        // If no mismatches were found, return true
        this.network.node.log("Network validator weights match.");
        return true;
    }
}

module.exports = NetworkBlockValidator;
