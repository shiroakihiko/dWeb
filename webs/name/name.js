const Network = require('../../core/network/network.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const RegisterBlockProcessor = require('./core/blockprocessors/register/register.js');
const UpdateBlockProcessor = require('./core/blockprocessors/update/update.js');
const DefaultBlockProcessor = require('./core/blockprocessors/default/default.js');
const TransferBlockProcessor = require('./core/blockprocessors/transfer/transfer.js');
const RewardBlockProcessor = require('../../core/blockprocessors/rewards/contribution/reward.js');

class Register extends Network{
    
    constructor(config)
    {
        super(config); // Calling parent constructor with argument
    }

    async initialize(node)
    {
        await super.initialize(node);
        this.blockManager.addProcessor('reward', new RewardBlockProcessor(this));
        this.blockManager.addProcessor('register', new RegisterBlockProcessor(this));
        this.blockManager.addProcessor('update', new UpdateBlockProcessor(this));
        this.blockManager.addProcessor('default', new DefaultBlockProcessor(this));
        this.blockManager.addProcessor('transfer', new TransferBlockProcessor(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
    }
}

module.exports = Register;