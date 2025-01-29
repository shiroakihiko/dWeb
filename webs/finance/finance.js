const Network = require('../../core/network/network.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const PeerMessageHandler = require('./network/peer-message-handler.js');
const RewardBlockProcessor = require('../../core/blockprocessors/rewards/contribution/reward.js');

class Finance extends Network{
    
    constructor(config)
    {
        super(config); // Calling parent constructor with argument
    }

    async initialize(node)
    {
        await super.initialize(node);
        this.blockManager.addProcessor('reward', new RewardBlockProcessor(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
        node.AddPeerMessageHandler(new PeerMessageHandler(this));
    }
}

module.exports = Finance;
