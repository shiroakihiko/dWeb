class FilePeerMessageHandler {

    constructor(network) {
        this.network = network;
    }

    async handleMessage(data, socket) {
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
            console.log(data);
        const block = this.network.ledger.getBlock(data.contentId);
        if (block != null) {
            this.network.node.sendMessage(socket, {
                type: 'getFileResponse',
                file: block,
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
