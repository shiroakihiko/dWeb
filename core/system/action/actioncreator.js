const Action = require('./action.js');
const ActionHelper = require('../../utils/actionhelper.js');

class ActionCreator {
    constructor(network) {
        this.network = network;
    }

    // Main method to create a new action
    async createAction(actionData) {
        const processor = this.network.actionManager.getInstructionProcessor(actionData.type);
        if (!processor) {
            return { state: 'INVALID_ACTION_TYPE' };
        }

        // Create instruction using the processor
        const instruction = await processor.createInstruction(actionData);

        // Get last seen block hash
        const lastSeenBlockHash = this.network.ledger.getLastBlockHash();

        // From account
        const fromAccount = actionData.account || this.network.node.nodeId;

        // Get the account nonce
        let nonce = actionData.nonce;
        if(!nonce) {
            const account = this.network.ledger.getAccount(fromAccount);
            nonce = account ? account.nonce : 0;
        }

        // Initialize action object with basic properties
        const action = new Action({
            timestamp: Date.now(),
            account: fromAccount,
            nonce: nonce,
            delegator: actionData.delegator || this.network.node.nodeId,
            lastSeenBlockHash: lastSeenBlockHash,
            instruction: instruction,
            signatures: {} // Signatures keyed by account.
        });

        // Sign the action if private keyis provided. Otherwise sign with node private key.
        const privateKey = actionData.privateKey || this.network.node.nodePrivateKey;
        if (privateKey) {
            await this.signAction(action, privateKey);
        }
        
        // Generate the action hash
        await action.generateHash();

        // Validate the action structure (e.g., via consensus rules)
        /* We could validate the action but appears redundant, more importantly it doubles the creation time */
        /*
        const validAction = await this.network.actionManager.validateAction(action);
        if (!validAction) {
            return { state: 'MALFORMED_ACTION', action: null };
        }
        */

        return { state: 'VALID', action: action };
    }

    // Sign the action, handling multiple signatures.
    async signAction(action, privateKey) {
        const signature = await ActionHelper.signAction(privateKey, action);
        action.signatures[this.network.node.nodeId] = signature;
    }

    // Prepare an action received via RPC (unsigned/unhashed).
    async prepareAction(action) {
        const validAction = this.network.actionManager.validateActionStructure(action);
        if (!validAction) {
            return { state: 'MALFORMED_ACTION', action: null };
        }
        const parsedAction = new Action(action);
        parsedAction.timestamp = Date.now();
        await parsedAction.generateHash();
        return { state: 'VALID', action: parsedAction };
    }
}

module.exports = ActionCreator;