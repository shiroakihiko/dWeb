class FilePeerMessageHandler {

    constructor(network) {
        this.network = network;
    }

    handleMessage(data, socket) {
        try {
            if (data.type === 'getFile') {
                this.handleGetFileRequest(data, socket);
                return true;
            }
        } catch(err) {
            this.network.node.error(err);
            return true;
        }

        return false;
    }

    handleGetFileRequest(data, socket) {
        const action = this.network.ledger.getAction(data.contentId);
        if (action != null) {
            this.network.node.sendMessage(socket, {
                type: 'getFileResponse',
                file: action,
                reply_id: data.id
            });
        } else {
            this.network.node.sendMessage(socket, {
                type: 'getFileResponse',
                file: null,
                reply_id: data.id
            });
        }
    }
}

module.exports = FilePeerMessageHandler;
