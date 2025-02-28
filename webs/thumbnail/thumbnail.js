const Network = require('../../core/network/network.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const ThumbnailInstruction = require('./core/instructions/thumbnail/thumbnail.js');
const DefaultThumbnailInstruction = require('./core/instructions/default/default.js');

class Thumbnail extends Network{
    
    constructor(config)
    {
        super(config); // Calling parent constructor with argument
    }

    async initialize(node)
    {
        await super.initialize(node);
        this.actionManager.registerInstructionType('thumbnail', new ThumbnailInstruction(this));
        this.actionManager.registerInstructionType('default', new DefaultThumbnailInstruction(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
    }
}

module.exports = Thumbnail;