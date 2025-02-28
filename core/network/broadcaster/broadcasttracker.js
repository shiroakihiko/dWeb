const Signer = require('../../utils/signer');
const Hasher = require('../../utils/hasher');

class BroadcastTracker {
    constructor(node) {
        this.node = node;
        // Track message signatures and delivery status
        this.messageSigners = new Map();    // messageHash -> {nodeId: signature}
        this.messageSent = new Map();       // messageHash -> Set<nodeId>
        this.messageReceived = new Map();    // messageHash -> Set<nodeId>
        this.messageTimestamps = new Map();  // messageHash -> timestamp
        
        // Cleanup old tracking data periodically
        this.timerCleanup = setInterval(() => this.cleanup(), 300000); // 5 minutes
    }

    Stop() {
        clearInterval(this.timerCleanup);
    }

    /**
     * Create hash for message content (excluding signatures)
     */
    async createMessageHash(message) {
        const messageContent = {...message};
        delete messageContent.broadcastSignatures;
        delete messageContent.nodeId;
        delete messageContent.id;
        delete messageContent.signature;
        return await Hasher.hashText(JSON.stringify(messageContent));
    }

    /**
     * Sign a message and track our signature
     */
    async addSignatures(message) {
        const messageHash = await this.createMessageHash(message);
        const signedMessage = {
            ...message,
            broadcastSignatures: {}
        };
        
        // Add our signature
        const signature = await Signer.signMessage(messageHash, this.node.nodePrivateKey);
        signedMessage.broadcastSignatures[this.node.nodeId] = signature;
        
        // Track our signature
        if (!this.messageSigners.has(messageHash)) {
            this.messageSigners.set(messageHash, {});
        }
        this.messageSigners.get(messageHash)[this.node.nodeId] = signature;

        // Add any other known signatures for this message
        const knownSigners = this.messageSigners.get(messageHash) || {};
        Object.entries(knownSigners).forEach(([nodeId, sig]) => {
            if (nodeId !== this.node.nodeId) {
                signedMessage.broadcastSignatures[nodeId] = sig;
            }
        });
        
        return signedMessage;
    }

    /**
     * Verify signatures in a message and track them
     */
    async verifySignatures(message) {
        const messageHash = await this.createMessageHash(message);
        const verifiedNodes = new Set();

        if (!message.broadcastSignatures) {
            return verifiedNodes;
        }

        const nodeIds = Object.keys(message.broadcastSignatures);
        const signatures = Object.values(message.broadcastSignatures);
        const messages = new Array(signatures.length).fill(messageHash);

        const results = await Signer.batchVerifySignatures(messages, signatures, nodeIds);
        results.forEach((isValid, index) => {
            if (isValid) {
                const nodeId = nodeIds[index];
                verifiedNodes.add(nodeId);
                // Track verified signature
                if (!this.messageSigners.has(messageHash)) {
                    this.messageSigners.set(messageHash, {});
                }
                this.messageSigners.get(messageHash)[nodeId] = signatures[index];
            }
        });

        return verifiedNodes;
    }

    /**
     * Track message delivery status
     */
    trackMessageSent(messageHash, nodeId) {
        if (!this.messageSent.has(messageHash)) {
            this.messageSent.set(messageHash, new Set());
            this.messageTimestamps.set(messageHash, Date.now());
        }
        this.messageSent.get(messageHash).add(nodeId);
    }

    trackMessageReceived(messageHash, nodeId) {
        if (!this.messageReceived.has(messageHash)) {
            this.messageReceived.set(messageHash, new Set());
            this.messageTimestamps.set(messageHash, Date.now());
        }
        this.messageReceived.get(messageHash).add(nodeId);
    }

    /**
     * Check if a node should receive a message
     */
    shouldSendToNode(messageHash, nodeId) {
        // Don't send if they've already signed
        const signers = this.messageSigners.get(messageHash);
        if (signers && signers[nodeId]) {
            return false;
        }

        // Don't send if we've received from them
        if (this.messageReceived.get(messageHash)?.has(nodeId)) {
            return false;
        }

        // Don't send if we've already sent to them
        if (this.messageSent.get(messageHash)?.has(nodeId)) {
            return false;
        }

        return true;
    }

    /**
     * Track an incoming message
     */
    async trackIncomingMessage(message, sourceNodeId) {
        const messageHash = await this.createMessageHash(message);
        
        // Verify and track signatures
        const verifiedSigners = await this.verifySignatures(message);
        for (const nodeId of verifiedSigners) {
            this.trackMessageReceived(messageHash, nodeId);
        }

        // Track the source
        this.trackMessageReceived(messageHash, sourceNodeId);

        return {
            messageHash,
            verifiedSigners
        };
    }

    /**
     * message received before
     */
    async messageHandledBefore(message) {
        const messageHash = await this.createMessageHash(message);
        return this.messageReceived.get(messageHash) != null || this.messageSent.get(messageHash) != null;
    }

    /**
     * Clear tracking data from message
     */
    clearSignaturesFromMessage(message) {
        const cleanMessage = {...message};
        delete cleanMessage.broadcastSignatures;
        delete cleanMessage.nodeId;
        delete cleanMessage.id;
        delete cleanMessage.signature;
        return cleanMessage;
    }

    /**
     * Cleanup old tracking data
     */
    cleanup(maxAge = 3600000) { // 1 hour default
        const now = Date.now();
        const cutoff = now - maxAge;

        for (const [messageHash, timestamp] of this.messageTimestamps) {
            if (timestamp < cutoff) {
                this.messageSigners.delete(messageHash);
                this.messageSent.delete(messageHash);
                this.messageReceived.delete(messageHash);
                this.messageTimestamps.delete(messageHash);
            }
        }
    }

    /**
     * Get tracking info for a message
     */
    getMessageInfo(messageHash) {
        return {
            signers: Object.keys(this.messageSigners.get(messageHash) || {}),
            sent: Array.from(this.messageSent.get(messageHash) || []),
            received: Array.from(this.messageReceived.get(messageHash) || []),
            timestamp: this.messageTimestamps.get(messageHash)
        };
    }
}

module.exports = BroadcastTracker; 