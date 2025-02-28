const Hasher = require('../../utils/hasher');
const Action = require('../action/action');

class Block {
    constructor(data) {
        this.hash = data.hash || null;
        this.previousBlockHash = data.previousBlockHash || null;
        this.actions = [];
        this.timestamp = data.timestamp || Date.now();
        this.creator = data.creator || null;

        // Parse actions
        for (const action of data.actions) {
            let parsedAction = action;
            if(!(action instanceof Action))
                parsedAction = new Action(action);
            this.actions.push(parsedAction);
        }

        // Cross-network actions
        this.crossNetworkActions = data.crossNetworkActions || {
            hashes: [],             // hashes of actions containing cross-network instructions
            baseHash: null,
            validatorSignatures: {}
        };

        // Validator signatures
        this.validatorSignatures = data.validatorSignatures || {};
    }

    async generateAndSetHash() {
        // Generate all actions hashes
        let actionHashes = '';
        for (const action of this.actions) {
            await action.generateHash();
            actionHashes += action.hash;
        }

        // Generate the block hash
        const data = this.previousBlockHash + actionHashes + this.timestamp + this.creator;
        this.hash = await Hasher.hashText(data);

        // Generate the cross-network hashes
        await this.generateCrossNetworkActions();

        return this.hash;
    }

    async generateCrossNetworkActions() {
        // Get actions that contain cross-network instructions
        const crossNetworkActions = this.actions.filter(action => 
            action.instruction.targetNetwork
        );
        
        this.crossNetworkActions.hashes = crossNetworkActions.map(action => action.hash);
        this.crossNetworkActions.baseHash = await this.calculateCrossNetworkBaseHash();
    }

    async calculateCrossNetworkBaseHash() {
        if (!this.crossNetworkActions.hashes.length) return null;
        
        // Include blockHash to bind cross-network actions to block
        const data = this.hash + ':' + this.crossNetworkActions.hashes.join(':');
        return await Hasher.hashText(data);
    }

    toJson() {
        return {
            hash: this.hash,
            previousBlockHash: this.previousBlockHash,
            actions: this.actions,
            timestamp: this.timestamp,
            creator: this.creator,
            crossNetworkActions: this.crossNetworkActions,
            validatorSignatures: this.validatorSignatures
        };
    }
}

module.exports = Block; 