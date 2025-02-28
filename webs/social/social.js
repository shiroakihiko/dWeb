const Network = require('../../core/network/network.js');
const PostInstruction = require('./core/instructions/post/post.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');

class Social extends Network{
    
    constructor(config)
    {
        super(config); // Calling parent constructor with argument
    }

    async initialize(node)
    {
        await super.initialize(node);
        this.actionManager.registerInstructionType('post', new PostInstruction(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
    }
}

module.exports = Social;
