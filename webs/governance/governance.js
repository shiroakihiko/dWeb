const Network = require('../../core/network/network.js');
const ProposalInstruction = require('./core/instructions/proposal/proposal.js');
const CommentInstruction = require('./core/instructions/comment/comment.js');
const VoteInstruction = require('./core/instructions/vote/vote.js');
const VoteEndInstruction = require('./core/instructions/voteend/voteend.js');
const GenesisInstruction = require('./core/instructions/genesis/genesis.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');

class Governance extends Network{
    
    constructor(config)
    {
        super(config); // Calling parent constructor with argument
    }

    async initialize(node)
    {
        await super.initialize(node);
        this.actionManager.registerInstructionType('proposal', new ProposalInstruction(this));
        this.actionManager.registerInstructionType('comment', new CommentInstruction(this));
        this.actionManager.registerInstructionType('vote', new VoteInstruction(this));
        this.actionManager.registerInstructionType('voteend', new VoteEndInstruction(this));
        this.actionManager.registerInstructionType('genesis', new GenesisInstruction(this));
    }

    Start(node)
    {
        super.Start(node);
        node.AddRPCMessageHandler(new RPCMessageHandler(this));
    }
}

module.exports = Governance;
