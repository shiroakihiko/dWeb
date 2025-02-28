const EventEmitter = require('events');
const ActionBroadcaster = require('./actionbroadcaster');
const AccountUpdateManager = require('../../../ledger/account/accountupdatemanager');
const ActionHelper = require('../../../utils/actionhelper');

class PendingActionManager extends EventEmitter {
    constructor(network) {
        super();
        this.network = network;
        this.pendingActions = new Map();
        this.confirmedActions = new Set();
        this.confirmationCallbacks = new Map();
        this.actionBroadcaster = new ActionBroadcaster(network);
        this.callbacksOnAdded = [];
        
        // Add new properties for action queue
        this.actionQueue = [];
        this.isProcessingQueue = false;
        this.BATCH_SIZE = 500;
        this.BATCH_DELAY = 100; // milliseconds
    }

    Stop() {
        this.actionBroadcaster.Stop();
    }

    onActionsAdded(callback) {
        this.callbacksOnAdded.push(callback);
    }

    async addActions(actions, callbacks = null, sourceNodeId = null) {
        // Queue the actions and callbacks for processing
        for(const [index, action] of actions.entries()) {
            this.actionQueue.push({
                action,
                callback: callbacks ? callbacks[index] : null,
                sourceNodeId
            });

            // Let broadcaster know who send us the actions
            if(sourceNodeId) {
                this.actionBroadcaster.addActionHashToPeer(action.hash, sourceNodeId);
            }
        }

        // Start processing queue if not already running
        setTimeout(() => this.processActionQueue(), this.BATCH_DELAY);

        return []; // Return empty array since actual processing is deferred
    }

    async processActionQueue() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        try {
            while (this.actionQueue.length > 0) {
                const batch = this.actionQueue.splice(0, this.BATCH_SIZE);
                const addedActions = [];

                // Process batch
                for (const {action, callback, sourceNodeId} of batch) {
                    if (this.hasAction(action.hash)) {
                        continue;
                    }

                    if (await this.addAction(action, callback)) {
                        addedActions.push(action);
                    }
                }

                // Broadcast all added actions at once, after processing the batch
                if (addedActions.length > 0) {
                    this.network.node.log(`${addedActions.length} actions added to pending actions (${this.pendingActions.size}).`);
                    this.actionBroadcaster.broadcastActions(addedActions);
                    for (const cbOnAdded of this.callbacksOnAdded) {
                        cbOnAdded(addedActions);
                    }
                }

                // Add delay between batches
                if (this.actionQueue.length > 0) {
                    this.isProcessingQueue = false;
                    setTimeout(() => this.processActionQueue(), this.BATCH_DELAY);
                }
            }
        } finally {
            this.isProcessingQueue = false;
        }
    }

    async addAction(action, confirmationCallback = null) {
        // Check if action already confirmed
        if (confirmationCallback && this.confirmedActions.has(action.hash)) {
            confirmationCallback(null);
            return false;
        }

        // Validate the action first
        const validationResult = await this.network.actionManager.validateAction(action);
        if (validationResult.state !== 'VALID') {
            this.network.node.warn(`Rejecting action ${action.hash}: ${validationResult.state}`);
            return false;
        }

        // Check if we already have a pending action from this account with same nonce
        for (const pendingAction of this.pendingActions.values()) {
            if (pendingAction.account === action.account && 
                pendingAction.nonce === action.nonce) {
                this.network.node.warn(`Rejecting action ${action.hash}: Account ${action.account} already has pending action with nonce ${action.nonce}`);
                return false;
            }
        }

        // Check if the action has already been added
        if (this.pendingActions.has(action.hash) || this.confirmedActions.has(action.hash)) {
            return false;
        }

        // Check if unique id of cross network action is already in the ledger
        if(action.instruction.crossNetworkAction)
        {
            const crossActionValidationHash = await ActionHelper.generateHash(action.instruction.crossNetworkAction);
            if (crossActionValidationHash !== action.instruction.crossNetworkAction.hash) {
                this.network.node.warn(`Rejecting action ${action.hash}: Cross network action ${action.instruction.crossNetworkAction.hash} hash mismatch`);
                return false;
            }

            const crossAction = this.network.ledger.getCrossAction(action.instruction.crossNetworkAction.hash);
            if (crossAction) {
                this.network.node.warn(`Rejecting action ${action.hash}: Cross network action ${action.instruction.crossNetworkAction.hash} already exists`);
                return false;
            }   
            else {
                // Add cross network action to ledger
                this.network.ledger.setCrossAction(action.instruction.crossNetworkAction.hash, action);
            }
        }

        // Add action to pending
        this.pendingActions.set(action.hash, action);
        
        if (confirmationCallback) {
            this.confirmationCallbacks.set(action.hash, confirmationCallback);
        }
        
        this.emit('action:added', action);
        return true;
    }

    async getActionsForBlock(maxActions = 250) {
        const acceptedActions = [];
        
        // Create a dry-run account manager to simulate cumulative state
        const dryRunAccountManager = new AccountUpdateManager(this.network.ledger);
        dryRunAccountManager.setDryRun(true);

        // Group pending actions by account
        const actionsByAccount = new Map();
        const accountNonces = new Map();
        for (const action of this.pendingActions.values()) {
            // Skip actions with nonce lower than current account nonce
            if(!accountNonces.has(action.account)) {
                const accountNonce = this.network.ledger.getAccountNonce(action.account);
                accountNonces.set(action.account, accountNonce);
            }
            if(action.nonce < accountNonces.get(action.account)) {
                continue;
            }
            
            if (!actionsByAccount.has(action.account)) {
                actionsByAccount.set(action.account, []);
            }
            actionsByAccount.get(action.account).push(action);
        }

        // Sort actions within each account by nonce
        for (const actions of actionsByAccount.values()) {
            actions.sort((a, b) => a.nonce - b.nonce);
        }

        // Process each account's actions in nonce order
        for (const [account, actions] of actionsByAccount) {
            let validActionChain = true;
            let expectedNonce = actions[0].nonce; // Start with first action's nonce
            // If the first nonce does not match the accounts nonce we are missing actions and can skip it
            if (expectedNonce != accountNonces.get(account)) {
                validActionChain = false;
                break;
            }

            for (const action of actions) {
                // Break chain if nonce is not sequential
                if (action.nonce !== expectedNonce) {
                    validActionChain = false;
                    break;
                }

                // Validate the action
                const result = await this.network.actionManager.validateAction(action, dryRunAccountManager);
                if (result.state !== 'VALID') {
                    validActionChain = false;
                    break;
                }

                try {
                    // Try processing with dry run manager
                    const processResult = await this.network.actionManager.processAction({
                        action: action,
                        blockHash: null,
                        accountManager: dryRunAccountManager
                    });

                    if (processResult.state !== 'ACTION_ADDED') {
                        validActionChain = false;
                        break;
                    }

                    // Add action to accepted list if everything is valid
                    acceptedActions.push(action);
                    expectedNonce++;

                    // Break if we've reached max actions
                    if (acceptedActions.length >= maxActions) {
                        break;
                    }
                } catch (err) {
                    this.network.node.warn(`Action simulation failed for ${action.hash}: ${err.message}`);
                    validActionChain = false;
                    break;
                }
            }

            // If we've reached max actions, break out of account processing
            if (acceptedActions.length >= maxActions) {
                break;
            }
        }

        return acceptedActions;
    }

    hasAction(actionHash) {
        return this.pendingActions.has(actionHash);
    }

    getAction(actionHash) {
        return this.pendingActions.get(actionHash);
    }

    removeConfirmedActions(actionHashes = []) {
        // Batch process all actions first
        const actionsToProcess = [];
        for (const hash of actionHashes) {
            const action = this.getAction(hash);
            if (action) {
                actionsToProcess.push({hash, action});
            }
        }

        // Then do all the updates in batches
        for (const {hash, action} of actionsToProcess) {
            // Add to confirmed set
            this.confirmedActions.add(hash);
            
            // Remove from pending
            this.pendingActions.delete(hash);
            
            // Handle callback if exists
            const callback = this.confirmationCallbacks.get(hash);
            if (callback) {
                if(typeof callback === 'function')
                    callback(action);
                else
                    console.log(callback);
                this.confirmationCallbacks.delete(hash);
            }
        }

        // Batch remove from broadcaster
        if (actionsToProcess.length > 0) {
            // Could optimize ActionBroadcaster to handle batch removals
            this.actionBroadcaster.removePendingActions(actionHashes);
            
            // Batch emit events
            this.emit('actions:confirmed', actionHashes);
        }
    }

    getPendingActionCount() {
        return this.pendingActions.size;
    }

    cleanup() {
        // Optional: Add cleanup logic for old pending blocks
        const now = Date.now();
        const maxAge = 3600000; // 1 hour

        for (const [hash, action] of this.pendingActions.entries()) {
            if (now - action.timestamp > maxAge) {
                this.pendingActions.delete(hash);
                this.emit('action:expired', action);
            }
        }
    }
}

module.exports = PendingActionManager; 