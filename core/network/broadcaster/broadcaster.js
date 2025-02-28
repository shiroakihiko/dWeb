const BroadcastTracker = require('./broadcasttracker.js');

class Broadcaster {
    constructor(node) {
        this.node = node;
        this.tracker = new BroadcastTracker(node);
        this.actionListeners = [];
    }

    Stop() {
        this.tracker.Stop();
    }

    addActionListener(listener) {
        this.actionListeners.push(listener);
    }

    async broadcastSubscriptionMessage(topic, message) {
        const messageHash = await this.broadcastToPeers({
            type: 'subscriberMessage',
            topic,
            message 
        });
        this.node.info(`Subscriber message ${messageHash} broadcasted to peers`);
        return messageHash;
    }

    async broadcastActionConfirmations(actions, block) {
        // Send to subscribers only
        for (const action of actions) {
            // Skip network actions (node induced actions)
            if(action.instruction.type === 'network')
                continue;

            // Send to all subscribed to a topic
            this.node.sendSubscriberMessage('action_confirmation', { action });
            
            // Get all unique subscribers for both accounts involved in the action
            const uniqueSubscribers = new Set();
            
            // Add sender account subscribers
            if (action.account) {
                const senderSubs = this.node.subscriptionServer.getAccountSubscribers(action.account);
                if (senderSubs) {
                    for (const socket of senderSubs) {
                        if (!uniqueSubscribers.has(socket)) {  // This check is redundant but explicit
                            uniqueSubscribers.add(socket);
                        }
                    }
                }
            }
            
            // Add recipient account subscribers
            if (action.instruction?.toAccount) {
                const recipientSubs = this.node.subscriptionServer.getAccountSubscribers(action.instruction.toAccount);
                if (recipientSubs) {
                    for (const socket of recipientSubs) {
                        if (!uniqueSubscribers.has(socket)) {  // This check is redundant but explicit
                            uniqueSubscribers.add(socket);
                        }
                    }
                }
            }
            
            // Send to each unique subscriber exactly once
            uniqueSubscribers.forEach(socket => {
                this.node.subscriptionServer.sendMessage(socket, {
                    topic: 'action_confirmation',
                    action,
                    networkId: this.node.networkId
                });
            });
        }
        
        for (const listener of this.actionListeners) {
            for (const action of actions) {
                listener(action);
            }
        }
        
        this.node.info(`Action confirmations for ${actions.length} actions have been broadcasted to subscribers`);
    }

    async broadcastBlockConfirmation(block) {
        const messageHash = await this.broadcastToPeers({
            type: 'blockConfirmation',
            block
        });
        this.node.info(`Block ${block.hash} confirmation broadcasted to peers`);
        return messageHash;
    }

    // Subscriber-only broadcasts
    async broadcastLog(log) {
        this.node.sendSubscriberMessage('log_update', { log });
    }

    async broadcastToPeers(message) {
        // Create clean message without signatures
        const cleanMessage = this.tracker.clearSignaturesFromMessage(message);
        
        // Sign and get tracked message with signatures
        const trackedMessage = await this.tracker.addSignatures(cleanMessage);
        const messageHash = await this.tracker.createMessageHash(cleanMessage);
        
        // Send to eligible peers
        const connectedPeers = this.node.peers.peerManager.connectedNodes;
        for (const [nodeId, socket] of connectedPeers) {
            console.log(`nodeId: ${nodeId}`);
            console.log(`messageHash: ${messageHash}`);
            console.log(`shouldSendToNode: ${this.tracker.shouldSendToNode(messageHash, nodeId)}`);
            if (this.tracker.shouldSendToNode(messageHash, nodeId)) {
                this.node.sendMessage(socket, trackedMessage);
                this.tracker.trackMessageSent(messageHash, nodeId);
            }
        }
        
        return messageHash;
    }

    async broadcastToPeer(nodeId, message) {
        // Create clean message without signatures
        const cleanMessage = this.tracker.clearSignaturesFromMessage(message);
        
        // Sign and get tracked message with signatures
        const trackedMessage = await this.tracker.addSignatures(cleanMessage);
        const messageHash = await this.tracker.createMessageHash(cleanMessage);
        
        if(this.tracker.shouldSendToNode(messageHash, nodeId)) {
            this.node.sendMessage(this.node.peers.peerManager.connectedNodes.get(nodeId), trackedMessage);
            this.tracker.trackMessageSent(messageHash, nodeId);
        }
        else {
            this.node.warn(`Message ${messageHash} not sent to node ${nodeId} because it was already received/sent`);
        }
    }

    async receivedMessage(message, nodeId) {
        // Track signatures from received message
        await this.tracker.trackIncomingMessage(message, nodeId);
        return this.tracker.clearSignaturesFromMessage(message);
    }
}

module.exports = Broadcaster;
