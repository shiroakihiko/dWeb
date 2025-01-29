const Network = require('../../core/network/network.js');
const PostBlockProcessor = require('./core/blockprocessors/post/post.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const RewardBlockProcessor = require('../../core/blockprocessors/rewards/contribution/reward.js');

class Social extends Network{
    
    constructor(config)
    {
        super(config); // Calling parent constructor with argument
    }

    async initialize(node)
    {
        await super.initialize(node);
        this.blockManager.addProcessor('reward', new RewardBlockProcessor(this));
        this.blockManager.addProcessor('post', new PostBlockProcessor(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
    }
}

module.exports = Social;
