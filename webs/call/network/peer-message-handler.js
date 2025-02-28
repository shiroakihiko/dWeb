class CallPeerMessageHandler {

    constructor(network) {
        this.network = network;
    }

    handleMessage(data, socket) {
        try {
            if (data.type === 'subscriberMessage') {
                this.handleSubscriberMessage(socket, data);
                return true;
            }
        } catch(err) {
            this.network.node.error(err);
            return true;
        }

        return false;
    }



    // ------------ Subscriptions ------------

    handleSubscriberMessage(socket, data) {
        const { topic, message } = data;
        
        if(this.network.node.broadcaster.tracker.messageHandledBefore(data)) {  
            this.network.node.log(`Subscriber message received for topic ${topic}: ${JSON.stringify(message)} but already handled`);
            return;
        }

        this.network.node.GetSubscriptionServer().broadcastMessageToTopic(topic, message);
        this.network.node.broadcaster.receivedMessage(data, data.nodeId);
        this.network.node.broadcaster.broadcastSubscriptionMessage(topic, message);
        this.network.node.log(`Subscriber message received for topic ${topic}: ${JSON.stringify(message)} and passed to subscribed users`);
    }
}

module.exports = CallPeerMessageHandler;