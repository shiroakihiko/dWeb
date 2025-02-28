const Network = require('../../core/network/network.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const PeerMessageHandler = require('./network/peer-message-handler.js');
const ExchangeService = require('./core/exchangeservice.js');

class Exchange extends Network {
    constructor(config) {
        super(config);
        this.exchangeService = new ExchangeService(this);
    }

    async initialize(node) {
        await super.initialize(node);
    }

    Start(node) {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
        node.AddPeerMessageHandler(new PeerMessageHandler(this));
        
        // Initialize exchange manager
        this.exchangeService.initialize();
    }
}

module.exports = Exchange; 