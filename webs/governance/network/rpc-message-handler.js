const Decimal = require('decimal.js');  // Import Decimal for big number conversions
const Hasher = require('../../../core/utils/hasher.js');

class RPCMessageHandler {
    constructor(network) {
        this.network = network;
        this.node = network.node;
        this.actionManager = network.actionManager;
    }

    async handleMessage(message, req, res) {
        try {
            const method = message.method;

            // Handle actions based on 'action' field in the JSON body
            switch (method) {
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
        if (!data.action) {
            this.node.SendRPCResponse(res, { success: false, message: 'Action data missing' });
            return;
        }

        const parseResult = await this.actionManager.prepareAction(data.action);
        if (parseResult.state === 'VALID') {
            const valid_action = this.network.consensus.proposeAction(parseResult.action);
            if (valid_action) {
                this.node.SendRPCResponse(res, { success: true, action: parseResult.action.hash });
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
        
        const account = this.network.ledger.getAccount(accountId);
        if(account)
        {
            votingPower = account.votingPower ? account.votingPower : 0;
            totalRewards = account.totalRewards ? account.totalRewards : 0;        
        }
        const history = this.network.ledger.getAccountHistory(accountId);
        if (history && history.length > 0) {
            // Loop through each transaction in the history
            for (const tx of history) {
                if (tx.instruction.type === 'proposal')
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
            const history = this.network.ledger.getAccountHistory(networkId);
            if (history && history.length > 0) {
                // Loop through each transaction in the history
                for (const tx of history) {
                    // Convert raw units to display units (optional, depends on your implementation)
                    this.formatFee(tx);

                    // Process proposal transactions
                    if (tx.instruction.type === 'proposal') {
                        const proposalAccountId = await Hasher.hashText(`proposalAccount(${tx.hash})`);
                        const proposalAccount = this.network.ledger.getAccount(proposalAccountId);
                        if(proposalAccount)
                        {
                            tx.proposalAccount = proposalAccountId;
                            tx.networkId = networkId;
                            tx.votes = proposalAccount.votes;
                            tx.totalVotingScore = proposalAccount.totalVotingScore;
                            tx.totalVotingPower = proposalAccount.totalVotingPower;
                            tx.status = proposalAccount.status;
                            proposals.set(tx.hash, tx);
                            const proposalHistory = this.network.ledger.getAccountHistory(proposalAccountId);
                            if (proposalHistory && proposalHistory.length > 0) {
                                for (const proposalTx of proposalHistory) {
                                    // Process comment transactions
                                    if (proposalTx.instruction.type === 'comment') {
                                        proposalTx.networkId = networkId;
                                        if (!proposals_comments.has(tx.hash)) {
                                            proposals_comments.set(tx.hash, []);
                                        }
                                        // Push the comment to the corresponding proposal's comment array
                                        proposals_comments.get(tx.hash).push(proposalTx);
                                    }
                                    if(proposalTx.instruction.type == 'vote')
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
        if (!data.action) {
            this.node.SendRPCResponse(res, { success: false, message: 'Vote data missing' });
            return;
        }

        const parseResult = await this.actionManager.prepareAction(data.action);
        if (parseResult.state === 'VALID') {
            const valid_action = this.network.consensus.proposeAction(parseResult.action);
            if (valid_action) {
                this.node.SendRPCResponse(res, { success: true, action: parseResult.action.hash });
            } else {
                this.node.SendRPCResponse(res, { success: false, message: 'Vote not accepted.' });
            }
        } else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async addComment(res, data) {
        if (!data.action) {
            this.node.SendRPCResponse(res, { success: false, message: 'Comment data missing' });
            return;
        }

        const parseResult = await this.actionManager.prepareAction(data.action);
        if (parseResult.state === 'VALID') {
            const valid_action = this.network.consensus.proposeAction(parseResult.action);
            if (valid_action) {
                this.node.SendRPCResponse(res, { success: true, action: parseResult.action.hash });
            } else {
                this.node.SendRPCResponse(res, { success: false, message: 'Comment not accepted.' });
            }
        } else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }
    formatFee(tx)
    {
        if(tx.instruction.fee)
        {
            if(tx.instruction.fee.amount)
                tx.instruction.fee.amount = this.convertToDisplayUnit(tx.instruction.fee.amount);
            if(tx.instruction.fee.delegatorReward)
                tx.instruction.fee.delegatorReward = this.convertToDisplayUnit(tx.instruction.fee.delegatorReward);
            if(tx.instruction.fee.burnAmount)
                tx.instruction.fee.burnAmount = this.convertToDisplayUnit(tx.instruction.fee.burnAmount);
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
