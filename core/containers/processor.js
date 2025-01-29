const ContainerHelper = require('../utils/containerhelper.js');
const BlockContainer = require('./blockcontainer.js');
const Decimal = require('decimal.js');
const ContainerValidator = require('./validator.js');
const ContainerAdder = require('./adder.js');

class ContainerProcessor {
    constructor(network) {
        this.network = network;
        this.minimumStakePercentage = 1;

        this.validator = new ContainerValidator(network);
        this.adder = new ContainerAdder(network, this.validator);
    }

    // # Container Creation ------------------------------------------------------------------------------------------------
    
    async createContainer(previousContainerHash, blocks = []) {
        const container = new BlockContainer(previousContainerHash);
        container.creator = this.network.node.nodeId;
        
        // Add blocks to container (sorted by fee)
        for (const block of blocks) {
            container.addBlock(block);
        }

        // Calculate container hash
        container.calculateHash();

        // Sign the container as creator
        this.signContainer(container);

        return container.toJson();
    }

    signContainer(container) {
        const signature = ContainerHelper.signContainer(container, this.network.node.nodePrivateKey);
        container.validatorSignatures[this.network.node.nodeId] = signature;
    }

    // # Container Validation ------------------------------------------------------------------------------------------------

    async validateContainer(container, options) {
        return await this.validator.validateContainer(container, options);
    }

    async validateNetworkConfirmation(container) {
        return await this.validator.validateNetworkConfirmation(container);
    }

    // # Container Addition ------------------------------------------------------------------------------------------------

    async addContainer(container) {
        return await this.adder.addContainer(container);
    }
}

module.exports = ContainerProcessor; 