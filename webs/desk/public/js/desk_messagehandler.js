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
    registerNotificationHandler(actionType, handler) {
        this.notificationHandlers.set(actionType, handler);
    }

    handleMessage(data) {
        const networkId = data.networkId;
        if (this.messageHandlers.has(networkId)) {
            this.messageHandlers.get(networkId)(data);
        }

        if (data.topic === 'action_confirmation' && data.action) {
            if (data.action.instruction.toAccount === desk.wallet.publicKey) {
                this.handleNotification(data.action);
            }
        }
    }

    handleNotification(action) {
        const handler = this.notificationHandlers.get(action.instruction.type);
        if (handler) {
            handler(action);
            return;
        }
    
        // Show notification regardless of specific handler
        DeskNotifier.show({
            title: this.getDefaultTitle(action),
            message: this.getDefaultMessage(action),
            type: action.instruction.type
        });
    }

    getDefaultTitle(action) {
        switch (action.instruction.type) {
            case 'email':
                return 'New Email Received';
            default:
                return `New ${action.instruction.type} Received`;
        }
    }

    getDefaultMessage(action) {
        return `From: ${action.account.substring(0, 8)}...`;
    }
}