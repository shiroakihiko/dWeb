const Network = require('../../core/network/network.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const PeerMessageHandler = require('./network/peer-message-handler.js');
const URLMessageHandler = require('./network/url-message-handler.js');
const FileInstruction = require('./core/instructions/file/file.js');
class File extends Network{
    
    constructor(config)
    {
        super(config); // Calling parent constructor with argument
    }

    async initialize(node)
    {
        await super.initialize(node);
        this.actionManager.registerInstructionType('file', new FileInstruction(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
        node.AddPeerMessageHandler(new PeerMessageHandler(this));
        node.AddURLMessageHandler(new URLMessageHandler(this));
    }
}

module.exports = File;
