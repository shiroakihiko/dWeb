const BroadcastTracker = require('./broadcasttracker');

class Broadcaster {
    constructor(node) {
        this.node = node;
        this.tracker = new BroadcastTracker(node);
        this.blockListeners = [];
    }

    addBlockListener(listener) {
        this.blockListeners.push(listener);
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

    async broadcastBlockConfirmation(block) {
        // Send to subscribers only
        this.node.sendSubscriberMessage('block_confirmation', { block });
        
        // Cross-network communication if needed
        if (block.type === 'networkUpdate') {
            this.node.sendOtherNetworks({
                type: 'networkUpdate',
                block
            });
        }
        for (const listener of this.blockListeners) {
            listener(block);
        }
        
        this.node.info(`Block confirmation for ${block.hash} has been broadcasted to subscribers`);
    }

    async broadcastContainerConfirmation(container) {
        const messageHash = await this.broadcastToPeers({
            type: 'containerConfirmation',
            container
        });
        this.node.info(`Container ${container.hash} confirmation broadcasted to peers`);
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
        const trackedMessage = this.tracker.addSignatures(cleanMessage);
        const messageHash = this.tracker.createMessageHash(cleanMessage);
        
        // Send to eligible peers
        const connectedPeers = this.node.peers.peerManager.connectedNodes;
        for (const [nodeId, socket] of connectedPeers) {
            console.log(`nodeId: ${nodeId}`);
            console.log(`messageHash: ${messageHash}`);
            console.log(`shouldSendToNode: ${this.tracker.shouldSendToNode(messageHash, nodeId)}`);
            if (this.tracker.shouldSendToNode(messageHash, nodeId)) {
                this.node.sendMessageAsync(socket, trackedMessage);
                this.tracker.trackMessageSent(messageHash, nodeId);
            }
        }
        
        return messageHash;
    }

    async broadcastToPeer(nodeId, message) {
        // Create clean message without signatures
        const cleanMessage = this.tracker.clearSignaturesFromMessage(message);
        
        // Sign and get tracked message with signatures
        const trackedMessage = this.tracker.addSignatures(cleanMessage);
        const messageHash = this.tracker.createMessageHash(cleanMessage);
        
        if(this.tracker.shouldSendToNode(messageHash, nodeId)) {
            await this.node.sendMessageAsync(this.node.peers.peerManager.connectedNodes.get(nodeId), trackedMessage);
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
