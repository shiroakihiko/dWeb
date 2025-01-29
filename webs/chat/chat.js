const Network = require('../../core/network/network.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const ChatMSGBlockProcessor = require('./core/blockprocessors/chatmsg/chatmsg.js');
const RewardBlockProcessor = require('../../core/blockprocessors/rewards/contribution/reward.js');

class Chat extends Network{
    
    constructor(config)
    {
        super(config); // Calling parent constructor with argument
    }

    async initialize(node)
    {
        await super.initialize(node);
        this.blockManager.addProcessor('reward', new RewardBlockProcessor(this));
        this.blockManager.addProcessor('chatmsg', new ChatMSGBlockProcessor(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
    }
}

module.exports = Chat;
