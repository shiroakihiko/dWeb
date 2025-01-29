const Ajv = require('ajv');
const Decimal = require('decimal.js');
const BlockHelper = require('../../utils/blockhelper.js');
const BlockFeeCalculator = require('../shared/feecalculator.js');
const BaseFee = require('../base/basefee.js');
const crypto = require('crypto');

// This class validates fields that are shared among blocks
class SharedValidator {
    constructor(network) {
        this.network = network;
        this.ajv = new Ajv({
            strict: false,
            strictSchema: false
        });
        this.schemaCache = new Map();

        this.metrics = {
            lastValidationTime: 0,
            schemaValidationTime: 0,
            hashCheckTime: 0,
            amountValidationTime: 0,
            accountCheckTime: 0,
            delegatorCheckTime: 0,
            signatureValidationTime: 0,
            timestampCheckTime: 0,
            networkSignatureTime: 0
        };
    }

    async validateBlock(block, checks, schema)
    {
        const startTime = performance.now();

        // Schema validation timing
        const schemaStart = performance.now();
        const blockStripped = { ...block };
        delete blockStripped.hash;
        delete blockStripped.validatorSignatures;
        delete blockStripped.delegatorTime;
        
        const validSchema = await this.validSchema(schema, blockStripped);
        this.metrics.schemaValidationTime = performance.now() - schemaStart;
        
        if (!validSchema) {
            this.network.node.debug('Schema validation metrics:', {
                time: `${this.metrics.schemaValidationTime.toFixed(2)}ms`,
                blockType: block.type,
                cacheHit: this.schemaCache.has(this.generateSchemaKey(schema))
            });
            return { state: 'MALFORMED_BLOCK' };
        }

        // Do the additional checks with timing
        for (let check of checks) {
            const checkStart = performance.now();
            
            if(check == 'hash') {
                if (!(await this.validateBlockNew(block))) {
                    this.metrics.hashCheckTime = performance.now() - checkStart;
                    return { state: 'BLOCK_EXISTS' };
                }
                this.metrics.hashCheckTime = performance.now() - checkStart;
            }
            else if(check == 'amount') {
                if (!(await this.validateAmount(block))) {
                    this.metrics.amountValidationTime = performance.now() - checkStart;
                    return { state: 'INSUFICIENT_BALANCE' };
                }
                this.metrics.amountValidationTime = performance.now() - checkStart;
            }
            else if(check == 'fromAccount') {
                if(!(await this.validateAccountExist(block.fromAccount))) {
                    this.metrics.accountCheckTime = performance.now() - checkStart;
                    return { state: 'ACCOUNT_NOT_FOUND' };
                }
                this.metrics.accountCheckTime = performance.now() - checkStart;
            }
            else if(check == 'delegator') {
                if(!(await this.accountIsDelegator(block.delegator))) {
                    this.metrics.delegatorCheckTime = performance.now() - checkStart;
                    return { state: 'DELEGATOR_NOT_FOUND' };
                }
                this.metrics.delegatorCheckTime = performance.now() - checkStart;
            }
            else if(check == 'signature') {
                if(!(await this.validateSignature(block))) {
                    this.metrics.signatureValidationTime = performance.now() - checkStart;
                    return { state: 'INVALID_SIGNATURE' };
                }
                this.metrics.signatureValidationTime = performance.now() - checkStart;
            }
            else if(check == 'timestamp') {
                if(!(await this.validateTimestamp(block))) {
                    this.metrics.timestampCheckTime = performance.now() - checkStart;
                    return { state: 'INVALID_TIMESTAMP' };
                }
                this.metrics.timestampCheckTime = performance.now() - checkStart;
            }
            else if(check == 'networkSigned') {
                if(!await this.signedByNetwork(block)) {
                    this.metrics.networkSignatureTime = performance.now() - checkStart;
                    return { state: 'INVALID_NETWORK_SIGNATURES' };
                }
                this.metrics.networkSignatureTime = performance.now() - checkStart;
            }
        }

        this.metrics.lastValidationTime = performance.now() - startTime;

        // Log performance metrics
        /*if(this.network.node) {
            this.network.node.debug('Block validation metrics:', {
                totalTime: `${this.metrics.lastValidationTime.toFixed(2)}ms`,
                schema: `${this.metrics.schemaValidationTime.toFixed(2)}ms`,
                hash: `${this.metrics.hashCheckTime.toFixed(2)}ms`,
                amount: `${this.metrics.amountValidationTime.toFixed(2)}ms`,
                account: `${this.metrics.accountCheckTime.toFixed(2)}ms`,
                delegator: `${this.metrics.delegatorCheckTime.toFixed(2)}ms`,
                signature: `${this.metrics.signatureValidationTime.toFixed(2)}ms`,
                timestamp: `${this.metrics.timestampCheckTime.toFixed(2)}ms`,
                networkSignatures: `${this.metrics.networkSignatureTime.toFixed(2)}ms`,
                checksPerformed: checks.join(', ')
            });
        }*/

        return { state: 'VALID' };
    }

    async validSchema(schema, block) {
        try {
            const schemaKey = this.generateSchemaKey(schema);
            
            // Get or compile schema validator
            let validate = this.schemaCache.get(schemaKey);
            
            if (!validate) {
                validate = this.ajv.compile(schema);
                this.schemaCache.set(schemaKey, validate);
            }

            const result = validate(block);
            if(!result) {
                console.log(`Validation for block ${block.type} failed:`, validate.errors, block);
            }

            return result;
        }
        catch(err) {
            console.log(err);
            return false;
        }
    }

    // Generate a consistent hash for schema objects
    generateSchemaKey(schema) {
        // Sort the schema to ensure consistent stringification
        const sortObject = (obj) => {
            if (typeof obj !== 'object' || obj === null) {
                return obj;
            }
            
            if (Array.isArray(obj)) {
                return obj.map(sortObject).sort();
            }
            
            return Object.keys(obj).sort().reduce((sorted, key) => {
                sorted[key] = sortObject(obj[key]);
                return sorted;
            }, {});
        };

        const sortedSchema = sortObject(schema);
        const schemaString = JSON.stringify(sortedSchema);
        return crypto.createHash('md5').update(schemaString).digest('hex');
    }

    // Helpers ------------
    // Custom validation for amount check
    async validateAmount(block) {
        // Validate that amount is non-negative
        if (new Decimal(block.amount).lt(0))
            return false;

        const senderAccount = await this.network.ledger.getAccount(block.fromAccount);
        if (!senderAccount)
            return false;

        if (new Decimal(block.amount).gt(senderAccount.balance))
            return false;

        return true;
    }

    // Custom validation for account existence
    async validateAccountExist(accountId) {
        return (await this.network.ledger.getAccount(accountId)) != null;
    }

    // Custom validation to check if an account has voting weight (is a delegator)
    async accountIsDelegator(accountId) {
        return (await this.network.ledger.getVoteWeight(accountId)) != null;
    }

    // Custom validation for block signature
    async validateSignature(block) {
        return BlockHelper.verifySignatureWithPublicKey(block, block.signature, block.fromAccount);
    }

    // Verify timestamp and make sure the timestamps are not too far off
    // so timebased blocks (e.g. VoteEnd, Swaps) can be executed autonomously
    async validateTimestamp(block) {
        // Allow max for a 5 minute disprecancy beween nodes
        const currentTimestamp = Math.floor(Date.now() / 1000); // Convert milliseconds to seconds
        if (currentTimestamp - parseInt(block.delegatorTime) >= 300)
            return false;
    
        return true;
    }

    // Custom validation for block non-existence
    async validateBlockNew(block) {
        return (await this.network.ledger.getBlock(block.hash)) == null;
    }
    
    // This will go through all the peers and check if the peers make up
    // the majority of the voting power based on our local last known
    // network weight table in the dWebs main chain
    async signedByNetwork(block) {
        // Get last updated network voting weights for this account
        const networkAccount =  block.networkAccount;
        // We check the dWebs main chain for the network voting weights
        const network = this.network.node.dnetwork.networks.get('9581d2133dc15e59b696a72ab65252e64961d6a6956dfad9b86c83a88ec70c29'); // Finance network (dWeb's main chain)
        if(!network)
        {
            // Can't verify the validity of the quorum behind the network signatures if we don't have the main network with the entries
            return false;
        }
        const lastNetworkVotingWeights = await network.ledger.getNetworkValidatorWeights(networkAccount);

        // If no previous network voting weights are found only the owner can change them
        if (!lastNetworkVotingWeights) {
            const originalOwnerSigned = BlockHelper.verifySignatureWithPublicKey(block, block.signature, networkAccount);
            if (originalOwnerSigned)
                return true;

            return false;
        }

        // Iterate over network voting weights and check if signatures are valid
        let totalVotingPower = 0;
        for (const nodeId in lastNetworkVotingWeights) {
            if (lastNetworkVotingWeights.hasOwnProperty(nodeId)) {
                const votingPower = lastNetworkVotingWeights[nodeId];

                // Check if the nodeId has a valid signature in the block
                if (block.validatorSignatures[nodeId]) {
                    const isSignatureValid = BlockHelper.verifySignatureWithPublicKey(block, block.validatorSignatures[nodeId], nodeId);

                    // If the signature is valid, add the voting power
                    if (isSignatureValid) {
                        totalVotingPower += votingPower;
                    }
                }
            }
        }

        // Check if the total voting power exceeds or is equal to 67%
        if (totalVotingPower >= 67) {
            return true;
        } else {
            return false;
        }
    }

    getMetrics() {
        return {
            ...this.metrics,
            averageValidationTime: this.metrics.lastValidationTime
        };
    }
}

module.exports = SharedValidator;
