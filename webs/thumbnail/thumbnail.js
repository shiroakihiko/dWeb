const Network = require('../../core/network/network.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const ThumbnailBlockProcessor = require('./core/blockprocessors/thumbnail/thumbnail.js');
const DefaultThumbnailBlockProcessor = require('./core/blockprocessors/default/default.js');
const RewardBlockProcessor = require('../../core/blockprocessors/rewards/contribution/reward.js');

class Thumbnail extends Network{
    
    constructor(config)
    {
        super(config); // Calling parent constructor with argument
    }

    async initialize(node)
    {
        await super.initialize(node);
        this.blockManager.addProcessor('reward', new RewardBlockProcessor(this));
        this.blockManager.addProcessor('thumbnail', new ThumbnailBlockProcessor(this));
        this.blockManager.addProcessor('default', new DefaultThumbnailBlockProcessor(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
    }
}

module.exports = Thumbnail;