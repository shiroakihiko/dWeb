class DeskMessageHandler {
    constructor() {
        this.messageHandlers = new Map();
        this.notificationHandlers = new Map();
    }

    addMessageHandler(networkId, handler) {
        this.messageHandlers.set(networkId, handler);
    }

    removeMessageHandler(networkId) {
        return this.messageHandlers.delete(networkId);
    }

    hasMessageHandler(networkId) {
        return this.messageHandlers.has(networkId);
    }

    // Add handler for specific block types
    registerNotificationHandler(blockType, handler) {
        this.notificationHandlers.set(blockType, handler);
    }

    handleMessage(data) {
        const networkId = data.networkId;
        if (this.messageHandlers.has(networkId)) {
            this.messageHandlers.get(networkId)(data);
        }

        if (data.topic === 'block_confirmation' && data.block) {
            if (data.block.toAccount === desk.wallet.publicKey) {
                this.handleNotification(data.block);
            }
        }
    }

    handleNotification(block) {
        const handler = this.notificationHandlers.get(block.type);
        if (handler) {
            handler(block);
            return;
        }
    
        // Show notification regardless of specific handler
        DeskNotifier.show({
            title: this.getDefaultTitle(block),
            message: this.getDefaultMessage(block),
            type: block.type
        });
    }

    getDefaultTitle(block) {
        switch (block.type) {
            case 'email':
                return 'New Email Received';
            default:
                return `New ${block.type} Received`;
        }
    }

    getDefaultMessage(block) {
        return `From: ${block.fromAccount.substring(0, 8)}...`;
    }
}