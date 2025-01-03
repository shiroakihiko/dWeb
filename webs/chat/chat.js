const Network = require('../../core/network/network.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const ChatMSGBlockProcessor = require('./core/blockprocessors/chatmsg/chatmsg.js');

class Chat extends Network{
    
    constructor(config)
    {
        super(config); // Calling parent constructor with argument
        this.blockManager.addProcessor('chatmsg', new ChatMSGBlockProcessor(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
    }
}

module.exports = Chat;
