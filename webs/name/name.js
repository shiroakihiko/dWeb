const Network = require('../../core/network/network.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const RegisterInstruction = require('./core/instructions/register/register.js');
const UpdateInstruction = require('./core/instructions/update/update.js');
const DefaultInstruction = require('./core/instructions/default/default.js');
const TransferInstruction = require('./core/instructions/transfer/transfer.js');

class Register extends Network{
    
    constructor(config)
    {
        super(config); // Calling parent constructor with argument
    }

    async initialize(node)
    {
        await super.initialize(node);
        this.actionManager.registerInstructionType('register', new RegisterInstruction(this));
        this.actionManager.registerInstructionType('update', new UpdateInstruction(this));
        this.actionManager.registerInstructionType('default', new DefaultInstruction(this));
        this.actionManager.registerInstructionType('transfer', new TransferInstruction(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
    }
}

module.exports = Register;