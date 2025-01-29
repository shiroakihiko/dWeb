class SubscriptionHandler {
    constructor(network) {
        this.network = network;
        this.subscriptionServer = this.network.node.GetSubscriptionServer();
        this.subscriptionServer.AddMessageHandler('callData', this.handleCallData.bind(this));   
    }

    handleCallData(socket, data) {
        console.log(data.channelId);
        this.forwardCallData(data.channelId, data, socket);
    }

    forwardCallData(channelId, data, excludeSocket) {
        const topic = 'callChannel' + channelId;
        const topicSubscribers = this.subscriptionServer.topics.get(topic);
        
        if (topicSubscribers) {
            topicSubscribers.forEach(socket => {
                if (socket !== excludeSocket && socket.readyState === WebSocket.OPEN) {
                    this.subscriptionServer.sendMessage(socket, data);
                }
            });
        }
    }
}

module.exports = SubscriptionHandler;