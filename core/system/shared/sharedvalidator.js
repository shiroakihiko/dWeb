const Ajv = require('ajv');
const Decimal = require('decimal.js');
const ActionHelper = require('../../utils/actionhelper.js');
const Hasher = require('../../utils/hasher.js');
const CrossNetworkMessage = require('../crossnetwork/crossmessage.js');
// This class validates fields that are shared among actions
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

    async validateAction(action, checks, schema)
    {
        const startTime = performance.now();

        // Schema validation timing
        const schemaStart = performance.now();
        const actionStripped = { ...action };
        delete actionStripped.hash; // Remove the hash as it's also not part of a users signed action
        delete actionStripped.timestamp; // Remove the timestamp

        const validSchema = await this.validSchema(schema, actionStripped);
        this.metrics.schemaValidationTime = performance.now() - schemaStart;
        
        if (!validSchema) {
            this.network.node.debug('Schema validation metrics:', {
                time: `${this.metrics.schemaValidationTime.toFixed(2)}ms`,
                actionType: action.type,
                cacheHit: this.schemaCache.has(await this.generateSchemaKey(schema))
            });
            return { state: 'MALFORMED_ACTION' };
        }

        // Do the additional checks with timing
        for (let check of checks) {
            const checkStart = performance.now();
            
            if(check == 'hash') {
                if (!(this.validateActionNew(action))) {
                    this.metrics.hashCheckTime = performance.now() - checkStart;
                    return { state: 'ACTION_EXISTS' };
                }
                this.metrics.hashCheckTime = performance.now() - checkStart;
            }
            else if(check == 'account') {
                if(!(this.validateAccountExist(action.account))) {
                    this.metrics.accountCheckTime = performance.now() - checkStart;
                    return { state: 'ACCOUNT_NOT_FOUND' };
                }
                this.metrics.accountCheckTime = performance.now() - checkStart;
            } 
            else if(check == 'delegator') {
                if(!(this.accountIsDelegator(action.delegator))) {
                    this.metrics.delegatorCheckTime = performance.now() - checkStart;
                    return { state: 'DELEGATOR_NOT_FOUND' };
                }
                this.metrics.delegatorCheckTime = performance.now() - checkStart;
            }
            else if(check == 'signatures') {
                if(!(await this.validateActionSignatures(action))) {
                    this.metrics.signatureValidationTime = performance.now() - checkStart;
                    return { state: 'INVALID_SIGNATURES' };
                }
                this.metrics.signatureValidationTime = performance.now() - checkStart;
            }
            else if(check == 'timestamp') {
                if(!(this.validateTimestamp(action))) {
                    this.metrics.timestampCheckTime = performance.now() - checkStart;
                    return { state: 'INVALID_TIMESTAMP' };
                }
                this.metrics.timestampCheckTime = performance.now() - checkStart;
            }
            else if(check == 'lastSeenDistance') {
                if(!this.validateLastSeenDistance(action)) {
                    this.metrics.lastSeenDistanceTime = performance.now() - checkStart;
                    return { state: 'INVALID_LAST_SEEN_DISTANCE' };
                }
                this.metrics.lastSeenDistanceTime = performance.now() - checkStart;
            }
            /*else if(check == 'networkSigned') {
                if(!(await this.signedByNetwork(action))) {
                    this.metrics.networkSignatureTime = performance.now() - checkStart;
                    return { state: 'INVALID_NETWORK_SIGNATURES' };
                }
                this.metrics.networkSignatureTime = performance.now() - checkStart;
            }*/
        }

        this.metrics.lastValidationTime = performance.now() - startTime;

        // Log performance metrics
        /*if(this.network.node) {
            this.network.node.debug('Action validation metrics:', {
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

    async validateInstruction(instruction, checks, schema) {
        const validSchema = await this.validSchema(schema, instruction);
        if (!validSchema) {
            this.network.node.debug('Schema validation metrics:', {
                instructionType: instruction.type,
                cacheHit: this.schemaCache.has(await this.generateSchemaKey(schema))
            });
            return { state: 'MALFORMED_INSTRUCTION' };
        }

        if(checks.includes('amount')) {
            if (!(this.validateAmount(instruction))) {
                return { state: 'INSUFICIENT_BALANCE' };
            }
        }

        return { state: 'VALID' };
    }

    async validSchema(schema, action) {
        try {
            const schemaKey = await this.generateSchemaKey(schema);
            
            // Get or compile schema validator
            let validate = this.schemaCache.get(schemaKey);
            
            if (!validate) {
                validate = this.ajv.compile(schema);
                this.schemaCache.set(schemaKey, validate);
            }

            const result = validate(action);
            if(!result) {
                console.log(`Validation for action ${action.hash} failed:`, validate.errors, action);
            }

            return result;
        }
        catch(err) {
            console.log(err);
            return false;
        }
    }

    // Generate a consistent hash for schema objects
    async generateSchemaKey(schema) {
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
        return await Hasher.hashText(schemaString);
    }

    // Helpers ------------
    // Custom validation for amount check
    validateAmount(action) {
        // Validate that amount is non-negative
        if (new Decimal(action.instruction.amount).lt(0))
            return false;

        const senderAccount = this.network.ledger.getAccount(action.account);
        if (!senderAccount)
            return false;

        if (new Decimal(action.instruction.amount).gt(senderAccount.balance))
            return false;

        return true;
    }

    // Custom validation for account existence
    validateAccountExist(accountId) {
        return (this.network.ledger.getAccount(accountId)) != null;
    }

    // Custom validation to check if an account has voting weight (is a delegator)
    accountIsDelegator(accountId) {
        return (this.network.ledger.getVoteWeight(accountId)) != null;
    }

    // Custom validation for action signature
    async validateActionSignatures(action) {
        if (!action.signatures) {
            return false;
        }

        // Verify signatures
        for (const [account, signature] of Object.entries(action.signatures)) {
            if (!(await ActionHelper.verifySignatureWithPublicKey(action, signature, account))) {
                return false;
            }
        }

        // If not a cross network action, check if the sender has signed the action
        if (!action.instruction.crossNetworkAction) {
            return await ActionHelper.verifySignatureWithPublicKey(action, action.signatures[action.account], action.account);
        }
        else {
            // If a cross network action, check if the network has signed the action
            return await this.signedByNetwork(action.instruction.crossNetworkAction, action.instruction.crossNetworkValidation);
        }
    }

    // Custom validation for last seen block
    // This prevents signed actions to stay alive without expiry and prevents nodes from
    // sending very old user signed actions that never got broadcasted to be a action entry in the ledger
    validateLastSeenDistance(action) {
        if (!action.lastSeenBlockHash) {
            return false;
        }
        const maxDistance = 180; // 180 actions max distance (may range anywhere between ~3 minutes to ~30 minutes)
        const blockDistance = this.network.ledger.getBlockDistance(action.lastSeenBlockHash, maxDistance);
        if (blockDistance === null) {
            return false;
        }

        // Check if the last seen block is within the max distance
        if (blockDistance > maxDistance) {
            return false;
        }

        return true;
    }

    // Verify timestamp and make sure the timestamps are not too far off
    // so timebased actions (e.g. VoteEnd, Swaps) can be executed autonomously
    validateTimestamp(action) {
        if(!action.timestamp)
            return false;

        // Allow max for a 5 minute disprecancy beween nodes
        const currentTimestamp = Math.floor(Date.now() / 1000); // Convert milliseconds to seconds
        if (currentTimestamp - parseInt(action.timestamp) >= 300)
            return false;
    
        return true;
    }

    // Custom validation for action non-existence
    validateActionNew(action) {
        return (this.network.ledger.getAction(action.hash)) == null;
    }
    async signedByNetwork(crossNetworkAction, crossNetworkValidation) {
        return await this.network.consensus.crossNetworkMessage.verifyAction(crossNetworkAction, crossNetworkValidation);
    }
    /*
    // This will go through all the peers and check if the peers make up
    // the majority of the voting power based on our local last known
    // network weight table in the dWebs main chain
    async signedByNetwork(instruction) {
        const networkAccount = instruction.networkAccount; // Get last updated network voting weights for the network account

        // We check the dWebs main chain for the network voting weights
        const network = this.network.node.dnetwork.networks.get('9581d2133dc15e59b696a72ab65252e64961d6a6956dfad9b86c83a88ec70c29'); // Finance network (dWeb's main chain)
        if(!network)
        {
            // Can't verify the validity of the quorum behind the network signatures if we don't have the main network with the entries
            return false;
        }
        const lastNetworkVotingWeights = network.ledger.getNetworkValidatorWeights(networkAccount);

        // If no previous network voting weights are found only the owner can change them
        if (!lastNetworkVotingWeights) {
            for (const nodeId in instruction.validatorSignatures) {
                const validatorSignature = instruction.validatorSignatures[nodeId];
                const originalOwnerSigned = ActionHelper.verifySignatureWithPublicKey(instruction, validatorSignature, nodeId);
                if (originalOwnerSigned)
                    return true;
            }
            return false;
        }

        // Iterate over network voting weights and check if signatures are valid
        let totalVotingPower = 0;
        for (const nodeId in lastNetworkVotingWeights) {
            if (lastNetworkVotingWeights.hasOwnProperty(nodeId)) {
                const votingPower = lastNetworkVotingWeights[nodeId];

                // Check if the nodeId has a valid signature in the action
                if (instruction.validatorSignatures[nodeId]) {
                    const isSignatureValid = ActionHelper.verifySignatureWithPublicKey(instruction, instruction.validatorSignatures[nodeId], nodeId);

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
    */

    getMetrics() {
        return {
            ...this.metrics,
            averageValidationTime: this.metrics.lastValidationTime
        };
    }
}

module.exports = SharedValidator;
