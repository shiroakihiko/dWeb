const Network = require('../../core/network/network.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const PeerMessageHandler = require('./network/peer-message-handler.js');
const CallMediaServer = require('./network/callmediaserver.js');
const ConfigHandler = require('../../core/utils/confighandler.js');
const path = require('path');
const RewardBlockProcessor = require('../../core/blockprocessors/rewards/contribution/reward.js');

class Call extends Network{    
    constructor(config)
    {
        super(config); // Calling parent constructor with argument
    }

    async initialize()
    {
        await super.initialize();
        const mainConfig = ConfigHandler.getMainConfig();
        this.callMediaServer = new CallMediaServer(this, { mediaWssPort: mainConfig.mediaWssPort, mediaWsPort: mainConfig.mediaWsPort, certPath: path.join(__dirname, '../../certs/') });
        this.blockManager.addProcessor('reward', new RewardBlockProcessor(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
        node.AddPeerMessageHandler(new PeerMessageHandler(this));
        this.callMediaServer.Start(node);
    }
}

module.exports = Call;