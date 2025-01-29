const DeskFrontendServer = require('./core/deskfrontendserver.js');
const DeskRPC = require('./core/deskrpc.js');

class Desk {
    constructor(options)
    {
    }

    async initialize(node)
    {
    }

    Start(node)
    {
        this.node = node;

        this.deskServer = new DeskFrontendServer(node);
        this.deskServer.bindToNode(node);

        this.deskRPC = new DeskRPC(node);
        this.deskRPC.bindToNode(node);
    }
}

module.exports = Desk;
