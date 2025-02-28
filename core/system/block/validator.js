const Ajv = require('ajv');
const Decimal = require('decimal.js');
const BlockHelper = require('../../utils/blockhelper');
const AccountUpdateManager = require('../../ledger/account/accountupdatemanager');
const Signer = require('../../utils/signer');
class BlockValidator {
    constructor(network) {
        this.network = network;

        this.quorumThreshold = new Decimal(0.67);

        this.metrics = {
            lastValidationTime: 0,
            structureTime: 0,
            hashTime: 0,
            creatorSignatureTime: 0,
            signatureValidationTime: 0,
            timestampValidationTime: 0,
            actionOrderTime: 0,
            actionValidationTime: 0,
            eligibleValidatorsTime: 0,
            chainValidationTime: 0
        };
    }

    async validateBlock(block, options = {ignoreActionCheck: false, ignoreConfirmationCheck: false, ignoreGenesisExistsCheck: false}) {
        const startTime = performance.now();

        // Consensus quorum validation if not genesis block
        if(block.previousBlockHash !== null && !options.ignoreConfirmationCheck) {
            if(!(await this.validateNetworkConfirmation(block))) {
                this.network.node.warn('Block has not met network confirmation quorum');
                return false;
            }
        }

        // Genesis block check
        if(block.previousBlockHash === null && !options.ignoreGenesisExistsCheck) {
            if(this.network.ledger.blocks.getCount() !== 0) {
                this.network.node.warn('Genesis block already exists');
                return false;
            }
        }

        // Structure validation timing
        const structureStart = performance.now();
        if (!this.validateStructure(block)) {
            this.network.node.warn('Invalid block structure');
            return false;
        }
        this.metrics.structureTime = performance.now() - structureStart;

        // Hash validation timing
        const hashStart = performance.now();
        if (!(await this.validateHash(block))) {
            this.network.node.warn('Invalid block hash');
            return false;
        }
        this.metrics.hashTime = performance.now() - hashStart;

        // Creator signature timing
        const creatorStart = performance.now();
        if (!(await this.validateCreatorSignature(block))) {
            this.network.node.warn('Invalid creator signature');
            return false;
        }
        this.metrics.creatorSignatureTime = performance.now() - creatorStart;

        // Signatures validation timing
        const sigStart = performance.now();
        if (!(await this.validateSignatures(block))) {
            this.network.node.warn('Invalid signatures');
            return false;
        }
        this.metrics.signatureValidationTime = performance.now() - sigStart;

        // Timestamp validation timing
        const timestampStart = performance.now();
        if (!this.validateTimestamp(block)) {
            this.network.node.warn('Invalid block timestamp');
            return false;
        }
        this.metrics.timestampValidationTime = performance.now() - timestampStart;

        // Action order validation timing
        const orderStart = performance.now();
        if (!this.validateActionOrder(block)) {
            this.network.node.warn('Invalid action order');
            return false;
        }
        this.metrics.actionOrderTime = performance.now() - orderStart;

        // Action validation timing
        const actionStart = performance.now();
        if(!options.ignoreActionCheck && !(await this.validateActions(block))) {
            this.network.node.warn('Contains invalid action');
            return false;
        }
        this.metrics.actionValidationTime = performance.now() - actionStart;

        if (block.previousBlockHash !== null) {
            // Eligible validators timing
            const eligibleStart = performance.now();
            if (!this.validateEligibleValidators(block)) {
                this.network.node.warn('Ineligible validator');
                return false;
            }
            this.metrics.eligibleValidatorsTime = performance.now() - eligibleStart;

            // Chain validation timing
            const chainStart = performance.now();
            if (!this.validateBlockChain(block)) {
                this.network.node.warn('Invalid chain continuity');
                return false;
            }
            this.metrics.chainValidationTime = performance.now() - chainStart;
        }

        this.metrics.lastValidationTime = performance.now() - startTime;

        // Log performance metrics
        this.network.node.debug('Block validation metrics:', {
            totalTime: `${this.metrics.lastValidationTime.toFixed(2)}ms`,
            structure: `${this.metrics.structureTime.toFixed(2)}ms`,
            hash: `${this.metrics.hashTime.toFixed(2)}ms`,
            creatorSignature: `${this.metrics.creatorSignatureTime.toFixed(2)}ms`,
            signatures: `${this.metrics.signatureValidationTime.toFixed(2)}ms`,
            timestamp: `${this.metrics.timestampValidationTime.toFixed(2)}ms`,
            actionOrder: `${this.metrics.actionOrderTime.toFixed(2)}ms`,
            actionValidation: `${this.metrics.actionValidationTime.toFixed(2)}ms`,
            eligibleValidators: `${this.metrics.eligibleValidatorsTime.toFixed(2)}ms`,
            chainValidation: `${this.metrics.chainValidationTime.toFixed(2)}ms`,
            actionCount: block.actions.length,
            signatureCount: Object.keys(block.validatorSignatures).length
        });

        return true;
    }

    validateStructure(block) {
        return (
            block &&
            typeof block.hash === 'string' &&
            typeof (block.previousBlockHash === 'string' || block.previousBlockHash === null) &&
            Array.isArray(block.actions) && block.actions.length > 0 &&
            typeof block.timestamp === 'number' &&
            typeof block.creator === 'string' &&
            typeof block.validatorSignatures === 'object'
        );
    }

    async validateHash(block) {
        const calculatedHash = await BlockHelper.generateBlockHash(block);
        return calculatedHash === block.hash;
    }

    async validateCreatorSignature(block) {
        const signature = block.validatorSignatures[block.creator];
        if (!signature) return false;
        return await BlockHelper.verifySignatureWithPublicKey(block, signature, block.creator);
    }

    validateBlockChain(block) {
        // Special case for first block (genesis)
        const lastBlockHash = this.network.ledger.getLastBlockHash();
        if (!lastBlockHash && block.previousBlockHash === null) {
            return true; // Valid genesis block
        }

        if (block.hash === block.previousBlockHash) {
            this.network.node.warn(`Block ${block.hash} already added. Expected: ${lastBlockHash}, Got: ${block.previousBlockHash}`);
            return false;
        }

        // Verify block links to the current chain head
        if (block.previousBlockHash !== lastBlockHash) {
            this.network.node.warn(`Block ${block.hash} has invalid previous hash. Expected: ${lastBlockHash}, Got: ${block.previousBlockHash}`);
            return false;
        }

        return true;
    }

    blockExists(blockHash) {
        const block = this.network.ledger.getBlock(blockHash);
        return block !== null;
    }

    async validateSignatures(block) {
        for (const [validatorId, signature] of Object.entries(block.validatorSignatures)) {
            if (!(await this.validSignature(block, signature, validatorId))) return false;
        }
        return true;
    }

    validateEligibleValidators(block) {
        const networkWeights = this.network.ledger.getNetworkValidatorWeights();
        for (const validatorId of Object.keys(block.validatorSignatures)) {
            if (!networkWeights[validatorId]) return false;
        }
        return true;
    }

    validateTimestamp(block) {
        const previousBlock = this.network.ledger.getBlock(block.previousBlockHash);
        
        // Check if timestamp is after previous block
        if (previousBlock && block.timestamp <= previousBlock.timestamp) {
            return false;
        }

        // Check if timestamp is not too far in future
        const maxFutureTime = Date.now() + (60 * 1000); // 1 minute
        if (block.timestamp > maxFutureTime) {
            return false;
        }

        return true;
    }

    validateActionOrder(block) {
        // Ensure actions are ordered by fee (highest to lowest)
        /*
        for (let i = 1; i < block.actions.length; i++) {
            if (block.actions[i-1].fee < block.actions[i].fee) {
                return false;
            }
        }*/
        // Todo: check for nonce order instead?
        return true;
    }

    async validateActionSignatures(block) {
        this.metrics.signatureVerificationTime = performance.now();
        // Collect and verify signatures of all actions to speed up later validation
        const signatures = [];
        const publicKeys = [];
        const messages = [];
        for (const action of block.actions) {
            for (const [validatorId, signature] of Object.entries(action.signatures)) {
                signatures.push(signature);
                publicKeys.push(validatorId);
                messages.push(action.hash);
            }
        }
        const backVerifySignatures = await Signer.batchVerifySignatures(messages, signatures, publicKeys);
        if(!backVerifySignatures) {
            return false;
        }
        this.metrics.signatureVerificationTime = performance.now() - this.metrics.signatureVerificationTime;
        this.network.node.log(`Signature verification time: ${this.metrics.signatureVerificationTime.toFixed(2)}ms for ${signatures.length} signatures`);
        return true;
    }

    async validateActions(block) {
        // First validate all actions in parallel
        const validationPromises = block.actions.map(action => 
            this.network.actionManager.validateAction(action)
        );

        try {
            const validationResults = await Promise.all(validationPromises);
            
            // Check validation results
            for(let i = 0; i < validationResults.length; i++) {
                const result = validationResults[i];
                if (result.state !== 'VALID') {
                    this.network.node.warn(`Block Validation: Action ${block.actions[i].hash} is invalid (${result.state})`);
                    return false;
                }
            }
        } catch (error) {
            this.network.node.warn('Action validation failed:', error);
            return false;
        }

        // Then do dry run simulation sequentially since account states need to be updated in order
        return await this.simulateActions(block);
    }

    async simulateActions(block) {
        // Create a dry run account manager
        const dryRunAccountManager = new AccountUpdateManager(this.network.ledger);
        dryRunAccountManager.setDryRun(true);

        // Process all actions in dry run mode
        for (const action of block.actions) {
            try {
                const result = await this.network.actionManager.processAction({
                    action, 
                    blockHash: block.hash, 
                    accountManager: dryRunAccountManager
                });
                
                if(result.state !== 'ACTION_ADDED' && result.state !== 'ACTION_EXISTS') {
                    this.network.node.warn(`Block Validation: Action ${action.hash} simulation failed (${result.state})`);
                    return false;
                }
            } catch (error) {
                this.network.node.warn(`Action processing simulation failed for ${action.hash}:`, error);
                return false;
            }
        }

        // Check if all updates would be valid
        const wouldBeValid = dryRunAccountManager.applyValidation();
        if (!wouldBeValid) {
            this.network.node.warn(`Block ${block.hash} would result in invalid account states`);
            return false;
        }

        return true;
    }

    // # Network Confirmation ------------------------------------------------------------------------------------------------

    async validateNetworkConfirmation(block) {
        // Helper function to safely get vote weight as Decimal
        const getVoteWeight = (nodeId) => {
            const weight = this.network.ledger.getVoteWeight(nodeId);
            return weight === null ? new Decimal(0) : new Decimal(weight);
        };

        // Get total network vote weight
        const totalVoteWeight = this.network.ledger.getTotalVoteWeight();
        if (!totalVoteWeight) {
            this.network.node.error('Could not retrieve total vote weight from ledger');
            return false;
        }

        // Calculate total weight of signing validators
        let signingWeight = new Decimal(0);
        for (const [validatorId, signature] of Object.entries(block.validatorSignatures)) {
            // Await the asynchronous validSignature method
            const validSignature = await this.validSignature(block, signature, validatorId);
            if (validSignature) {
                signingWeight = signingWeight.plus(getVoteWeight(validatorId));
            }
        }

        // Calculate quorum percentage
        const quorumPercentage = signingWeight.div(totalVoteWeight);
        const hasQuorum = quorumPercentage.gte(this.quorumThreshold);

        if (hasQuorum) {
            this.network.node.log(`Block ${block.hash} quorum: ${quorumPercentage.times(100).toFixed(2)}%`);
        } else {
            this.network.node.warn(`Block ${block.hash} quorum: ${quorumPercentage.times(100).toFixed(2)}%`);
        }

        return hasQuorum;
    }

    // # Helper ------------------------------------------------------------------------------------------------
    async validSignature(block, signature, validatorId) {
        return await BlockHelper.verifySignatureWithPublicKey(block, signature, validatorId);
    }

    getMetrics() {
        return {
            ...this.metrics,
            msPerAction: this.metrics.actionValidationTime / this.lastActionCount,
            msPerSignature: this.metrics.signatureValidationTime / this.lastSignatureCount
        };
    }
}

module.exports = BlockValidator; 