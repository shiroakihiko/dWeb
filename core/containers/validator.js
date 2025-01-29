const Ajv = require('ajv');
const Decimal = require('decimal.js');
const ContainerHelper = require('../utils/containerhelper');

class ContainerValidator {
    constructor(network) {
        this.network = network;

        // Initialize schema properties
        this.schemaProperties = {
            type: 'object',
            properties: {
                fromAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                toAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                amount: { type: ['string', 'number'] }
                //...this.chainLinker.getSchemaProperties()
            },
            required: [],
            additionalProperties: true
        };

        this.quorumThreshold = new Decimal(0.67);

        this.metrics = {
            lastValidationTime: 0,
            structureTime: 0,
            hashTime: 0,
            creatorSignatureTime: 0,
            signatureValidationTime: 0,
            timestampValidationTime: 0,
            blockOrderTime: 0,
            blockValidationTime: 0,
            eligibleValidatorsTime: 0,
            chainValidationTime: 0
        };
    }

    async validateContainer(container, options = {ignoreBlockCheck: false}) {
        const startTime = performance.now();
        this.network.node.log(`Validating container: ${container.hash}`);

        // Structure validation timing
        const structureStart = performance.now();
        if (!this.validateStructure(container)) {
            console.log(container);
            this.network.node.warn('Invalid container structure');
            return false;
        }
        this.metrics.structureTime = performance.now() - structureStart;

        // Hash validation timing
        const hashStart = performance.now();
        if (!this.validateHash(container)) {
            this.network.node.warn('Invalid container hash');
            return false;
        }
        this.metrics.hashTime = performance.now() - hashStart;

        // Creator signature timing
        const creatorStart = performance.now();
        if (!await this.validateCreatorSignature(container)) {
            this.network.node.warn('Invalid creator signature');
            return false;
        }
        this.metrics.creatorSignatureTime = performance.now() - creatorStart;

        // Signatures validation timing
        const sigStart = performance.now();
        if (!await this.validateSignatures(container)) {
            this.network.node.warn('Invalid signatures');
            return false;
        }
        this.metrics.signatureValidationTime = performance.now() - sigStart;

        // Timestamp validation timing
        const timestampStart = performance.now();
        if (!await this.validateTimestamp(container)) {
            this.network.node.warn('Invalid container timestamp');
            return false;
        }
        this.metrics.timestampValidationTime = performance.now() - timestampStart;

        // Block order validation timing
        const orderStart = performance.now();
        if (!this.validateBlockOrder(container)) {
            this.network.node.warn('Invalid block order');
            return false;
        }
        this.metrics.blockOrderTime = performance.now() - orderStart;

        // Block validation timing
        const blockStart = performance.now();
        if(!options.ignoreBlockCheck && !await this.validateBlocks(container)) {
            this.network.node.warn('Contains invalid block');
            return false;
        }
        this.metrics.blockValidationTime = performance.now() - blockStart;

        if (container.previousContainerHash !== null) {
            // Eligible validators timing
            const eligibleStart = performance.now();
            if (!await this.validateEligibleValidators(container)) {
                this.network.node.warn('Ineligible validator');
                return false;
            }
            this.metrics.eligibleValidatorsTime = performance.now() - eligibleStart;

            // Chain validation timing
            const chainStart = performance.now();
            if (!await this.validateContainerChain(container)) {
                this.network.node.warn('Invalid chain continuity');
                return false;
            }
            this.metrics.chainValidationTime = performance.now() - chainStart;
        }

        this.metrics.lastValidationTime = performance.now() - startTime;

        // Log performance metrics
        /*this.network.node.debug('Container validation metrics:', {
            totalTime: `${this.metrics.lastValidationTime.toFixed(2)}ms`,
            structure: `${this.metrics.structureTime.toFixed(2)}ms`,
            hash: `${this.metrics.hashTime.toFixed(2)}ms`,
            creatorSignature: `${this.metrics.creatorSignatureTime.toFixed(2)}ms`,
            signatures: `${this.metrics.signatureValidationTime.toFixed(2)}ms`,
            timestamp: `${this.metrics.timestampValidationTime.toFixed(2)}ms`,
            blockOrder: `${this.metrics.blockOrderTime.toFixed(2)}ms`,
            blockValidation: `${this.metrics.blockValidationTime.toFixed(2)}ms`,
            eligibleValidators: `${this.metrics.eligibleValidatorsTime.toFixed(2)}ms`,
            chainValidation: `${this.metrics.chainValidationTime.toFixed(2)}ms`,
            blockCount: container.blocks.length,
            signatureCount: Object.keys(container.validatorSignatures).length
        });*/

        return true;
    }

    validateStructure(container) {
        return (
            container &&
            typeof container.hash === 'string' &&
            typeof (container.previousContainerHash === 'string' || container.previousContainerHash === null) &&
            Array.isArray(container.blocks) && container.blocks.length > 0 &&
            typeof container.timestamp === 'number' &&
            typeof container.creator === 'string' &&
            typeof container.validatorSignatures === 'object'
        );
    }

    validateHash(container) {
        const calculatedHash = ContainerHelper.generateContainerHash(container);
        if(calculatedHash !== container.hash)
        {
            console.log(container);
            console.log(calculatedHash);
        }
        return calculatedHash === container.hash;
    }

    async validateCreatorSignature(container) {
        const signature = container.validatorSignatures[container.creator];
        if (!signature) return false;
        return ContainerHelper.verifySignatureWithPublicKey(container.hash, signature, container.creator);
    }

    async validateContainerChain(container) {
        // Special case for first container (genesis)
        const lastContainerHash = await this.network.ledger.getLastContainerHash();
        if (!lastContainerHash && container.previousContainerHash === null) {
            return true; // Valid genesis container
        }

        if (container.hash === container.previousContainerHash) {
            this.network.node.warn(`Container ${container.hash} already added. Expected: ${lastContainerHash}, Got: ${container.previousContainerHash}`);
            return false;
        }

        // Verify container links to the current chain head
        if (container.previousContainerHash !== lastContainerHash) {
            this.network.node.warn(`Container ${container.hash} has invalid previous hash. Expected: ${lastContainerHash}, Got: ${container.previousContainerHash}`);
            return false;
        }

        return true;
    }

    async containerExists(containerHash) {
        const container = await this.network.ledger.getContainer(containerHash);
        return container !== null;
    }

    async validateSignatures(container) {
        for (const [validatorId, signature] of Object.entries(container.validatorSignatures)) {
            if (!await this.validSignature(container.hash, signature, validatorId)) return false;
        }
        return true;
    }

    async validateEligibleValidators(container) {
        for (const validatorId of Object.keys(container.validatorSignatures)) {
            if (!await this.eligibleValidator(validatorId)) return false;
        }
        return true;
    }

    async validateTimestamp(container) {
        const previousContainer = await this.network.ledger.getContainer(container.previousContainerHash);
        
        // Check if timestamp is after previous container
        if (previousContainer && container.timestamp <= previousContainer.timestamp) {
            return false;
        }

        // Check if timestamp is not too far in future
        const maxFutureTime = Date.now() + (60 * 1000); // 1 minute
        if (container.timestamp > maxFutureTime) {
            return false;
        }

        return true;
    }

    validateBlockOrder(container) {
        // Ensure blocks are ordered by fee (highest to lowest)
        for (let i = 1; i < container.blocks.length; i++) {
            if (container.blocks[i-1].fee < container.blocks[i].fee) {
                return false;
            }
        }
        return true;
    }

    async validateBlocks(container) {
        for (const block of container.blocks) {
            const result = await this.network.blockManager.validateBlock(block);
            if (result.state != 'VALID') {
                this.network.node.debug(`Container Validation: Block ${block.hash} is invalid (${result.state})`);
                return false;
            }
        }
        return true;
    }

    // # Network Confirmation ------------------------------------------------------------------------------------------------

    async validateNetworkConfirmation(container) {
        // Helper function to safely get vote weight as Decimal
        const getVoteWeight = async (nodeId) => {
            const weight = await this.network.ledger.getVoteWeight(nodeId);
            return weight === null ? new Decimal(0) : new Decimal(weight);
        };

        // Get total network vote weight
        const totalVoteWeight = await this.network.ledger.getTotalVoteWeight();
        if (!totalVoteWeight) {
            this.network.node.error('Could not retrieve total vote weight from ledger');
            return false;
        }

        // Calculate total weight of signing validators
        let signingWeight = new Decimal(0);
        for (const [validatorId, signature] of Object.entries(container.validatorSignatures)) {
            // Await the asynchronous validSignature method
            const validSignature = await this.validSignature(container.hash, signature, validatorId);
            if (validSignature) {
                signingWeight = signingWeight.plus(await getVoteWeight(validatorId));
            }
        }

        // Calculate quorum percentage
        const quorumPercentage = signingWeight.div(totalVoteWeight);
        const hasQuorum = quorumPercentage.gte(this.quorumThreshold);

        if (hasQuorum) {
            this.network.node.log(`Container ${container.hash} quorum: ${quorumPercentage.times(100).toFixed(2)}%`);
        } else {
            this.network.node.warn(`Container ${container.hash} quorum: ${quorumPercentage.times(100).toFixed(2)}%`);
        }

        return hasQuorum;
    }

    // # Helper ------------------------------------------------------------------------------------------------
    async eligibleValidator(validatorId) {
        const networkWeights = await this.network.ledger.getNetworkValidatorWeights();
        if (!networkWeights[validatorId]) {
            return false;
        }
        return true;
    }
    async validSignature(containerHash, signature, validatorId) {
        return ContainerHelper.verifySignatureWithPublicKey(containerHash, signature, validatorId);
    }

    // Get the complete schema
    blockSchema() {
        return this.schemaProperties;
    }

    getMetrics() {
        return {
            ...this.metrics,
            msPerBlock: this.metrics.blockValidationTime / this.lastBlockCount,
            msPerSignature: this.metrics.signatureValidationTime / this.lastSignatureCount
        };
    }
}

module.exports = ContainerValidator; 