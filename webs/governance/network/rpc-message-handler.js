const BlockHelper = require('../../../core/utils/blockhelper');
const Decimal = require('decimal.js');  // Import Decimal for big number conversions
const BlockManager = require('../../../core/blockprocessors/blockmanager.js');
const crypto = require('crypto');

class RPCMessageHandler {
    constructor(network) {
        this.network = network;
        this.node = network.node;
        this.blockManager = network.blockManager;
    }

    async handleMessage(message, req, res) {
        try {
            const action = message.action;

            // Handle actions based on 'action' field in the JSON body
            switch (action) {
                case 'getGovernanceStats':
                    this.getGovernanceStats(res, message);
                    return true;
                case 'createProposal':
                    this.createProposal(res, message);
                    return true;
                case 'getProposals':
                    this.getProposals(res, message);
                    return true;
                case 'voteOnProposal':
                    this.voteOnProposal(res, message);
                    return true;
                case 'addComment':
                    this.addComment(res, message);
                    return true;
            }
        } catch (err) {
            this.network.node.error(err, err);
            this.node.SendRPCResponse(res, { success: false, message: 'Invalid request body' });
            return true;
        }

        return false;
    }

    async createProposal(res, data) {
        if (!data.block) {
            this.node.SendRPCResponse(res, { success: false, message: 'Block data missing' });
            return;
        }

        const parseResult = await this.blockManager.prepareBlock(data.block);
        if (parseResult.state === 'VALID') {
            const valid_block = await this.network.consensus.proposeBlock(parseResult.block);
            if (valid_block) {
                this.node.SendRPCResponse(res, { success: true, block: parseResult.block.hash });
            } else {
                this.node.SendRPCResponse(res, { success: false, message: 'Proposal not accepted.' });
            }
        } else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }
    async getGovernanceStats(res, data) {
        const { accountId } = data;

        let votingPower = 0;
        let totalRewards = 0;
        let totalProposals = 0;
        
        const account = await this.network.ledger.getAccount(accountId);
        if(account)
        {
            votingPower = account.votingPower ? account.votingPower : 0;
            totalRewards = account.totalRewards ? account.totalRewards : 0;        
        }
        const history = await this.network.ledger.getAccountHistory(accountId);
        if (history && history.length > 0) {
            // Loop through each transaction in the history
            for (const tx of history) {
                if (tx.type === 'proposal')
                {
                    totalProposals += 1;
                }
            }
        }
        
        this.node.SendRPCResponse(res, { success: true, votingPower, totalProposals });
    }

    async getProposals(res, data) {
        const { accountId } = data;

        let merged_proposals = [];

        // Loop over each networkId in the data
        for (const networkId of data.networks) {
            const proposals = new Map();
            const proposals_comments = new Map();
            const proposals_votes = new Map();
            // Fetch transaction history for the network
            const history = await this.network.ledger.getAccountHistory(networkId);
            if (history && history.length > 0) {
                // Loop through each transaction in the history
                for (const tx of history) {
                    // Convert raw units to display units (optional, depends on your implementation)
                    this.formatFee(tx);

                    // Process proposal transactions
                    if (tx.type === 'proposal') {
                        const proposalAccountId = crypto.createHash('sha256').update(`proposalAccount(${tx.hash})`).digest('hex');
                        const proposalAccount = await this.network.ledger.getAccount(proposalAccountId);
                        if(proposalAccount)
                        {
                            tx.proposalAccount = proposalAccountId;
                            tx.networkId = networkId;
                            tx.votes = proposalAccount.votes;
                            tx.totalVotingScore = proposalAccount.totalVotingScore;
                            tx.totalVotingPower = proposalAccount.totalVotingPower;
                            tx.status = proposalAccount.status;
                            proposals.set(tx.hash, tx);
                            const proposalHistory = await this.network.ledger.getAccountHistory(proposalAccountId);
                            if (proposalHistory && proposalHistory.length > 0) {
                                for (const proposalTx of proposalHistory) {
                                    // Process comment transactions
                                    if (proposalTx.type === 'comment') {
                                        proposalTx.networkId = networkId;
                                        if (!proposals_comments.has(tx.hash)) {
                                            proposals_comments.set(tx.hash, []);
                                        }
                                        // Push the comment to the corresponding proposal's comment array
                                        proposals_comments.get(tx.hash).push(proposalTx);
                                    }
                                    if(proposalTx.type == 'vote')
                                    {
                                        if(!proposals_votes.has(tx.hash))
                                        {
                                            proposals_votes.set(tx.hash, []);
                                        }
                                        proposals_votes.get(tx.hash).push(proposalTx);
                                    }
                                }
                            }
                        }
                    }

                }

                // Merge proposals with their respective comments and votes
                for (const [proposalHash, proposal] of proposals) {
                    // Check if there are comments for the current proposal
                    const comments = proposals_comments.get(proposalHash) || [];

                    // Attach the comments to the proposal
                    proposal.comments = comments;

                    // Attach votes to the proposal
                    proposal.voters = proposals_votes.get(proposalHash) || [];

                    // Add the merged proposal (with comments) to the list
                    merged_proposals.push(proposal);
                }
            }
        }

        // Sort proposals by timestamp newest first
        merged_proposals.sort((a, b) => b.timestamp - a.timestamp);
        
        // Send the response with merged proposals
        this.node.SendRPCResponse(res, { success: true, proposals: merged_proposals });
    }


    async voteOnProposal(res, data) {
        if (!data.block) {
            this.node.SendRPCResponse(res, { success: false, message: 'Vote data missing' });
            return;
        }

        const parseResult = await this.blockManager.prepareBlock(data.block);
        if (parseResult.state === 'VALID') {
            const valid_block = await this.network.consensus.proposeBlock(parseResult.block);
            if (valid_block) {
                this.node.SendRPCResponse(res, { success: true, block: parseResult.block.hash });
            } else {
                this.node.SendRPCResponse(res, { success: false, message: 'Vote not accepted.' });
            }
        } else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async addComment(res, data) {
        if (!data.block) {
            this.node.SendRPCResponse(res, { success: false, message: 'Comment data missing' });
            return;
        }

        const parseResult = await this.blockManager.prepareBlock(data.block);
        if (parseResult.state === 'VALID') {
            const valid_block = await this.network.consensus.proposeBlock(parseResult.block);
            if (valid_block) {
                this.node.SendRPCResponse(res, { success: true, block: parseResult.block.hash });
            } else {
                this.node.SendRPCResponse(res, { success: false, message: 'Comment not accepted.' });
            }
        } else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }
    formatFee(tx)
    {
        if(tx.fee)
        {
            if(tx.fee.amount)
                tx.fee.amount = this.convertToDisplayUnit(tx.fee.amount);
            if(tx.fee.delegatorReward)
                tx.fee.delegatorReward = this.convertToDisplayUnit(tx.fee.delegatorReward);
            if(tx.fee.burnAmount)
                tx.fee.burnAmount = this.convertToDisplayUnit(tx.fee.burnAmount);
        }
    }
    convertToDisplayUnit(input)
    {
        return new Decimal(input).dividedBy(new Decimal('100000000')).toFixed(8, Decimal.ROUND_HALF_DOWN);
    }
    convertToRawUnit(input)
    {
        return new Decimal(input).times(new Decimal('100000000')).toFixed(0, Decimal.ROUND_HALF_DOWN);
    }
}

module.exports = RPCMessageHandler;
