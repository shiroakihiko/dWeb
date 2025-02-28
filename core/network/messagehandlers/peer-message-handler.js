const WebSocket = require('ws');

class PeerMessageHandler {

    constructor(network) {
        this.network = network;
        this.handlers = new Map();
        this.registerHandlers();
    }

    // Register all peer message handlers
    registerHandlers() {
        if(!this.network.ledger)
            return;

        // Network related handlers
        this.registerHandler('telemetry', this.handleTelemetryRequest.bind(this));
        this.registerHandler('peer_list', this.handlePeerList.bind(this));
        this.registerHandler('crossNetworkActions', this.handleCrossNetworkActions.bind(this));
        
        // Account related handlers
        this.registerHandler('getAccountInfo', this.handleAccountInfoRequest.bind(this));
        //this.registerHandler('getAllActionsForAccount', this.handleGetAllActionsForAccountRequest.bind(this));

        // Action related handlers
        this.registerHandler('newActions', this.handleNewActions.bind(this));
        this.registerHandler('getAction', this.handleGetActionRequest.bind(this));
        this.registerHandler('getAllFrontiers', this.handleFrontiersRequest.bind(this));
        this.registerHandler('getActionsAfterHash', this.handleGetActionsAfterHashRequest.bind(this));

        // New block-related handlers
        this.registerHandler('blockProposal', this.handleBlockProposal.bind(this));
        this.registerHandler('blockConfirmation', this.handleBlockConfirmation.bind(this));
        this.registerHandler('getBlocks', this.handleGetBlocks.bind(this));
        this.registerHandler('getGenesisBlock', this.handleGetGenesisBlock.bind(this));
        this.registerHandler('getBlocksAfterHash', this.handleGetBlocksAfterHash.bind(this));
        this.registerHandler('getBlock', this.handleGetBlock.bind(this));
        this.registerHandler('getBlockWithActions', this.handleGetBlockWithActions.bind(this));
        this.registerHandler('getBlocksWithActions', this.handleGetBlocksWithActions.bind(this));
        this.registerHandler('getBlockChain', this.handleGetBlockChain.bind(this));
        this.registerHandler('getLastBlockHash', this.handleGetLastBlockHash.bind(this));

        // Add new election handlers
        this.registerHandler('election:vote', this.handleElectionVote.bind(this));
        this.registerHandler('election:request-votes', this.handleVoteRequest.bind(this));
        this.registerHandler('election:vote-response', this.handleVoteResponse.bind(this));
    }

    // Register a single handler
    registerHandler(method, callback) {
        this.handlers.set(method, callback);
    }

    // The default message handler that takes care
    // of the majority of what a network requires
    handleMessage(data, socket) {
        try {
            const handler = this.handlers.get(data.type);
            if (!handler) {
                return false;
            }
            handler(socket, data);
            return true;
        } catch(err) {
            this.network.node.error('Peer Request Error', err);
            return true;
        }
    }

    handleNewActions(socket, data) {
        const nodeId = data.nodeId;
        
        // Get clean action without signatures through broadcaster
        //const cleanMessage = await this.network.node.broadcaster.receivedMessage(data, nodeId);
        
        // Process the clean action
        //const actions = cleanMessage.actions;
        const actions = data.actions;
        this.network.node.log(`New actions received: ${actions.length} from ${nodeId}`);
        this.network.consensus.pendingActionManager.addActions(actions, null, nodeId);
    }

    handleTelemetryRequest(socket, data) {
        // Send telemetry ack
        const telemetry = this.network.node.getTelemetryData(this.network.node.networkId);
        this.network.node.sendMessage(socket, { type: 'telemetry_ack', telemetry: telemetry });
        this.network.node.peers.peerManager.addTelemetry(data.nodeId, data.telemetry);
    }

    handlePeerList(socket) {
        const peerList = Array.from(this.network.node.peers.peerManager.connectedPeers).map(peer => peer.remoteAddress);
        this.network.node.sendMessage(socket, {
            type: 'peer_list',
            peers: peerList
        });
    }

    handleCrossNetworkActions(socket, data) {
        this.network.node.info(`Cross network actions received: ${JSON.stringify(data)}`);
        this.network.consensus.crossNetworkMessage.handleCrossNetworkActions(data.batch);
    }

    handleGetActionsAfterHashRequest(socket, data) {
        const account = data.account;
        const lastHash = data.lastHash;
        const actions = this.network.ledger.getActionsAfterHash(account, lastHash);
        this.network.node.sendMessage(socket, {
            type: 'getActionsAfterHashResponse',
            actions: actions,
            reply_id: data.id
        });
    }

    handleGetAllActionsForAccountRequest(socket, data) {
        if (data.account)
        {
            const actions = this.network.ledger.getAllActionsForAccount(data.account);
            this.network.node.sendMessage(socket, {
                type: 'getAllActionsForAccountResponse',
                account: data.account,
                actions: actions,
                reply_id: data.id
            });
        }
        else if(data.accounts)
        {
            const accountActions = {};
            for (const account of data.accounts)
            {
                const actions = this.network.ledger.getAllActionsForAccount(account);
                accountActions[account] = actions;
            }
                
            this.network.node.sendMessage(socket, {
                type: 'getAllActionsForAccountResponse',
                accountActions: accountActions,
                reply_id: data.id
            });
        }
    }
    handleFrontiersRequest(socket, data) {
        const { start, count } = data;
        const frontiers = this.network.ledger.getFrontiers(start, count);
        this.network.node.sendMessage(socket, {
            type: 'frontiers_response',
            frontiers: frontiers,
            reply_id: data.id
        });
    }
    handleGetActionRequest(socket, data) {
        const action = this.network.ledger.getAction(data.hash);
        this.network.node.sendMessage(socket, {
            type: 'getActionResponse',
            hash: data.hash,
            action: action,
            reply_id: data.id
        });
    }

    handleAccountInfoRequest(socket, data) {
        const accountHash = data.account;
        const account = this.network.ledger.getAccount(accountHash);
        this.network.node.sendMessage(socket, {
            type: 'accountResponse',
            account: account,
            reply_id: data.id
        });
    }

    // Handle block proposal from peers
    handleBlockProposal(socket, data) {
        const nodeId = data.nodeId;
        
        /*// Get clean proposal without signatures
        const cleanMessage = await this.network.node.broadcaster.receivedMessage(data, nodeId);
        */

        const proposal = data.proposal;
        this.network.node.log(`Block proposal received from ${nodeId}: proposal.hash: ${proposal.hash}`);
        this.network.consensus.proposalManager.proposalBroadcaster.handleNewProposal(proposal, nodeId);
    }

    // Handle block confirmation from peers
    handleBlockConfirmation(socket, data) {
        const block = data.block;
        this.network.node.log(`Block confirmation received: ${block.hash}`);
    }

    handleGetBlocks(socket, data) {
        const offset = data.offset || 0;
        const limit = Math.min(data.limit || 50, 100); // Cap at 100 blocks
        const blocks = [];

        let currentHash = this.network.ledger.getLastBlockHash();
        let currentOffset = 0;

        // Walk back through the chain to find the requested blocks
        while (currentHash && blocks.length < limit && currentOffset < offset + limit) {
            const block = this.network.ledger.getBlock(currentHash);
            if (!block) break;

            if (currentOffset >= offset) {
                blocks.unshift(block); // Add to start to maintain order
            }

            currentHash = block.previousBlockHash;
            currentOffset++;
        }

        this.network.node.sendMessage(socket, {
            type: 'blocks',
            blocks: blocks,
            reply_id: data.id
        });
    }

    handleGetGenesisBlock(socket, data) {
        const genesisHash = this.network.ledger.getFirstBlockHash();
        if (!genesisHash) return;

        const block = this.network.ledger.getBlock(genesisHash);
        this.network.node.sendMessage(socket, {
            type: 'genesisBlock',
            block: block,
            reply_id: data.id
        });
    }

    handleGetBlocksAfterHash(socket, data) {
        const limit = Math.min(data.limit || 50, 100); // Cap at 100 blocks
        const blocks = [];
        let currentHash = data.hash;

        // Get blocks that follow the given hash
        while (blocks.length < limit) {
            const block = this.network.ledger.getBlock(currentHash);
            if (!block) break;

            const nextBlock = this.network.ledger.getBlock(block.nextBlockHash);
            if (!nextBlock) break;

            blocks.push(nextBlock);
            currentHash = nextBlock.hash;
        }

        this.network.node.sendMessage(socket, {
            type: 'blocks',
            blocks: blocks,
            reply_id: data.id
        });
    }

    handleGetBlock(socket, data) {
        const block = this.network.ledger.getBlock(data.hash);
        this.network.node.sendMessage(socket, {
            type: 'block',
            block: block,
            reply_id: data.id
        });
    }
    handleGetBlockWithActions(socket, data) {
        const block = this.network.ledger.getBlockWithActions(data.hash);
        this.network.node.sendMessage(socket, {
            type: 'blockWithActions',
            block: block,
            reply_id: data.id
        });
    }

    handleGetBlocksWithActions(socket, data) {
        const blocks = [];
        for (const blockHash of data.hashes) {
            const block = this.network.ledger.getBlockWithActions(blockHash);
            if (block) {
                blocks.push(block);
            }
        }

        this.network.node.sendMessage(socket, {
            type: 'blocksWithActions',
            blocks: blocks,
            reply_id: data.id
        });
    }

    handleGetBlockChain(socket, data) {
        const startHash = data.startHash; // Optional
        const blocks = this.network.ledger.getBlockChain(startHash);
        
        this.network.node.sendMessage(socket, {
            type: 'blockChain',
            blocks: blocks,
            reply_id: data.id
        });
    }

    handleGetLastBlockHash(socket, data) {
        const lastHash = this.network.ledger.getLastBlockHash();
        this.network.node.sendMessage(socket, {
            type: 'lastBlockHash',
            hash: lastHash,
            reply_id: data.id
        });
    }
    
    // ------------ Voting and Elections ------------

    handleElectionVote(socket, data) {
        try {
            const nodeId = data.nodeId;
            
            /*
            // Get clean vote without signatures
            const cleanMessage = await this.network.node.broadcaster.receivedMessage(data, nodeId);
            */
            const vote = data.vote;
            if (!vote.electionId || !vote.voterId || !vote.candidateId) {
                throw new Error('Missing required vote fields');
            }

            this.network.node.log(`Election vote received for ${vote.electionId} from voter (node): ${vote.voterId}`);
            // No need for an ack reply (only for testing purposes like performance benchmarks)
            //this.network.node.sendMessage(socket, { type: 'election:vote-ack', reply_id: data.id });
            this.network.consensus.electionManager.handleVote(vote, nodeId);
        } catch (err) {
            this.network.node.error('Failed to handle election vote:', err);
        }
    }
    handleVoteRequest(socket, data) {
        const { electionId } = data;
        const ownVote = this.network.consensus.electionManager.ownVotes.get(electionId);
        if (ownVote) {
            this.network.node.sendMessage(socket, { type: 'election:vote-response', vote: ownVote });
        }
    }
    handleVoteResponse(socket, data) {
        const { vote } = data;
        this.network.consensus.electionManager.handleVote(vote, socket.nodeId);
    }
}

module.exports = PeerMessageHandler;
