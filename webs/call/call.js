const Network = require('../../core/network/network.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const PeerMessageHandler = require('./network/peer-message-handler.js');
const CallMediaServer = require('./network/callmediaserver.js');
const ConfigHandler = require('../../core/utils/confighandler.js');
const path = require('path');
const RewardInstruction = require('../../core/system/instruction/types/rewards/contribution/reward.js');

class Call extends Network{    
    constructor(config)
    {
        super(config); // Calling parent constructor with argument
        this.config = config;
    }

    async initialize()
    {
        await super.initialize();
        this.callMediaServer = new CallMediaServer(this, { mediaWssPort: this.config.mediaWssPort, mediaWsPort: this.config.mediaWsPort, certPath: path.join(__dirname, '../../certs/') });
        this.actionManager.registerInstructionType('reward', new RewardInstruction(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
        node.AddPeerMessageHandler(new PeerMessageHandler(this));
        this.callMediaServer.Start(node);
    }

    Stop() {
        super.Stop();
        this.callMediaServer.Stop();
    }
}

module.exports = Call;