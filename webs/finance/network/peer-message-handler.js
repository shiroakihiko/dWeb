
class FinancePeerMessageHandler {

    constructor(network) {
        this.network = network;
    }

    handleMessage(data, socket) {
        try {
        } catch(err) {
            this.network.node.error(err);
            return true;
        }

        return false;
    }
}

module.exports = FinancePeerMessageHandler;
