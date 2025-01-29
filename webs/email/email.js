const Network = require('../../core/network/network.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const EmailBlockProcessor = require('./core/blockprocessors/email/email.js');
const RewardBlockProcessor = require('../../core/blockprocessors/rewards/contribution/reward.js');
class Email extends Network{
    
    constructor(config)
    {
        super(config); // Calling parent constructor with argument
    }

    async initialize(node)
    {
        await super.initialize(node);
        this.blockManager.addProcessor('reward', new RewardBlockProcessor(this));
        this.blockManager.addProcessor('email', new EmailBlockProcessor(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
    }
}

module.exports = Email;