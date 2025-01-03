const Network = require('../../core/network/network.js');
const PostBlockProcessor = require('./core/blockprocessors/post/post.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');

const fs = require('fs');

class Social extends Network{
    
    constructor(config)
    {
        super(config); // Calling parent constructor with argument
        this.blockManager.addProcessor('post', new PostBlockProcessor(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
    }
}

module.exports = Social;
