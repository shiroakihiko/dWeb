const Network = require('../../core/network/network.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const IndexInstruction = require('./core/instructions/index/index.js');
const SearchLedger = require('./core/ledger/ledger.js');
class Search extends Network{
    
    constructor(config)
    {
        super(config, new SearchLedger(config.dbPath)); // Calling parent constructor with argument
    }

    async initialize(node)
    {
        await super.initialize(node);
        this.actionManager.registerInstructionType('index', new IndexInstruction(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
    }
}

module.exports = Search;