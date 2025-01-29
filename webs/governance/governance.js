const Network = require('../../core/network/network.js');
const ProposalBlockProcessor = require('./core/blockprocessors/proposal/proposal.js');
const CommentBlockProcessor = require('./core/blockprocessors/comment/comment.js');
const VoteBlockProcessor = require('./core/blockprocessors/vote/vote.js');
const VoteEndBlockProcessor = require('./core/blockprocessors/voteend/voteend.js');
const GenesisBlockProcessor = require('./core/blockprocessors/genesis/genesis.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const RewardBlockProcessor = require('../../core/blockprocessors/rewards/contribution/reward.js');

class Governance extends Network{
    
    constructor(config)
    {
        super(config); // Calling parent constructor with argument
    }

    async initialize(node)
    {
        await super.initialize(node);
        this.blockManager.addProcessor('reward', new RewardBlockProcessor(this));
        this.blockManager.addProcessor('proposal', new ProposalBlockProcessor(this));
        this.blockManager.addProcessor('comment', new CommentBlockProcessor(this));
        this.blockManager.addProcessor('vote', new VoteBlockProcessor(this));
        this.blockManager.addProcessor('voteend', new VoteEndBlockProcessor(this));
        this.blockManager.addProcessor('genesis', new GenesisBlockProcessor(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
    }
}

module.exports = Governance;
