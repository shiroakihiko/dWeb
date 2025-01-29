const Network = require('../../core/network/network.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const IndexBlockProcessor = require('./core/blockprocessors/index/index.js');
const SearchLedger = require('./core/ledger/ledger.js');
const RewardBlockProcessor = require('../../core/blockprocessors/rewards/contribution/reward.js');
class Search extends Network{
    
    constructor(config)
    {
        super(config, new SearchLedger(config.dbPath)); // Calling parent constructor with argument
    }

    async initialize(node)
    {
        await super.initialize(node);
        this.blockManager.addProcessor('reward', new RewardBlockProcessor(this));
        this.blockManager.addProcessor('index', new IndexBlockProcessor(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
    }
}

module.exports = Search;