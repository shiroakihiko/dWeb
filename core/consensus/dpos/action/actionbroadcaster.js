class ActionBroadcaster {
    constructor(network) {
        this.network = network;
        this.peersHoldingActionHashes = new Map(); // peerId -> Set of action hashes
        this.pendingActions = [];
        this.isBroadcasting = false;
        this.BATCH_SIZE = 500;
        this.BATCH_INTERVAL = 250; // ms
        this.timerBroadcast = null;
    }
    
    Stop() {
        this.isBroadcasting = false;
        this.pendingActions = [];
        this.peersHoldingActionHashes.clear();
        clearTimeout(this.timerBroadcast);
    }

    // Keep single action broadcast for backward compatibility
    broadcastAction(action) {
        this.broadcastActions([action]);
    }

    // Broadcast multiple actions at once
    broadcastActions(actions, sourceNodeId = null) {
        this.pendingActions.push(...actions);
        if(sourceNodeId) {
            for (const action of actions) {
                this.addActionHashToPeer(action.hash, sourceNodeId);
            }
        }
        
        if(!this.timerBroadcast) {
            this.timerBroadcast = setTimeout(() => { this.processPendingActions(); }, this.BATCH_INTERVAL);
        }
    }

    processPendingActions() {
        this.timerBroadcast = null;

        const batch = this.pendingActions.splice(0, this.BATCH_SIZE);
        this.broadcastBatch(batch);
        console.log(`Broadcasted ${batch.length} actions, pending ${this.pendingActions.length}`);
        if (this.pendingActions.length > 0) {
            if(!this.timerBroadcast) {
                this.timerBroadcast = setTimeout(() => { this.processPendingActions(); }, this.BATCH_INTERVAL);
            }
        }
    }

    broadcastBatch(actions) {
        const connectedPeers = this.network.node.peers.peerManager.connectedNodes;
        
        let broadcastedActions = 0;
        for (const [nodeId, socket] of connectedPeers) {
            if(nodeId === this.network.node.nodeId) {
                continue;
            }
            if(!this.network.consensus.validatorSelector.isValidator(nodeId)) {
                continue;
            }

            const newActionsForPeer = this.getActionsForPeer(nodeId, actions);
            for (const action of newActionsForPeer) {
                this.addActionHashToPeer(action.hash, nodeId);
            }

            if(newActionsForPeer.length > 0) {
                this.network.node.sendMessage(socket, {
                    type: 'newActions',
                    actions: newActionsForPeer
                });
                broadcastedActions += newActionsForPeer.length;
                this.network.node.debug(`Batch of ${newActionsForPeer.length} actions broadcasted to peer ${nodeId}`);
            }
        }
        
        if(broadcastedActions > 0) {
            this.network.node.info(`Broadcasted ${broadcastedActions} actions to peers`);
        }
    }

    getActionsForPeer(nodeId, actions) {
        const actionsForPeer = [];
        if(!this.peersHoldingActionHashes.has(nodeId)) {
            return actions;
        }
        for(const action of actions) {
            if(!this.peersHoldingActionHashes.get(nodeId).has(action.hash)) {
                actionsForPeer.push(action);
            }
        }
        return actionsForPeer;
    }

    addActionHashToPeer(actionHash, nodeId) {
        if(!this.peersHoldingActionHashes.has(nodeId)) {
            this.peersHoldingActionHashes.set(nodeId, new Set());
        }
        this.peersHoldingActionHashes.get(nodeId).add(actionHash);
    }
    
    // Remove action from pending queue by hash
    removePendingActions(actionHashes) {
        // Create index map for faster lookup
        const hashSet = new Set(actionHashes);
        
        // Single pass through array to remove all matches
        let writeIndex = 0;
        for (let readIndex = 0; readIndex < this.pendingActions.length; readIndex++) {
            if (!hashSet.has(this.pendingActions[readIndex].hash)) {
                if (writeIndex !== readIndex) {
                    this.pendingActions[writeIndex] = this.pendingActions[readIndex];
                }
                writeIndex++;
            }
        }
        this.pendingActions.length = writeIndex;

        // Batch cleanup peer tracking
        for (const [nodeId, hashes] of this.peersHoldingActionHashes) {
            let removed = 0;
            for (const hash of actionHashes) {
                if (hashes.delete(hash)) {
                    removed++;
                }
            }
            if (hashes.size === 0) {
                this.peersHoldingActionHashes.delete(nodeId);
            }
        }
    }
}

module.exports = ActionBroadcaster; 