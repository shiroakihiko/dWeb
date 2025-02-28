class ExchangePeerMessageHandler {

    constructor(network) {
        this.network = network;
    }

    handleMessage(data, socket) {
        try {
            // Others inform us of new orders
            if (data.type === 'placeOrder') {
                this.handlePlaceOrder(data, socket);
                return true;
            }
            // Others inform us of cancelled orders
            if (data.type === 'cancelOrder') {
                this.handleCancelOrder(data, socket);
                return true;
            }
        } catch(err) {
            this.network.node.error(err);
            return true;
        }

        return false;
    }

    async handlePlaceOrder(data, socket) {
        const { order } = data;
        const result = this.network.exchangeService.placeOrder(order);
        this.network.node.sendMessage(socket, {
            type: 'placeOrderResponse',
            result: result
        });

        if(result.success) {
            // Inform others of our order
            this.network.node.sendAll({
                type: 'placeOrder',
                order: order
            });
        }
    }
    async handleCancelOrder(data, socket) {
        const { orderId, account } = data;
        const result = this.network.exchangeService.cancelOrder(orderId, account);
        this.network.node.sendMessage(socket, {
            type: 'cancelOrderResponse',
            result: result
        });
        
        if(result.success) {
            // Inform others of our cancelled order
            this.network.node.sendAll({
                type: 'cancelOrder',
                orderId: orderId,
                account: account
            });
        }
    }
}

module.exports = ExchangePeerMessageHandler;