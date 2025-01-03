const Network = require('../../core/network/network.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const EmailBlockProcessor = require('./core/blockprocessors/email/email.js');

class Email extends Network{
    
    constructor(config)
    {
        super(config); // Calling parent constructor with argument
        this.blockManager.addProcessor('email', new EmailBlockProcessor(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
    }
}

module.exports = Email;