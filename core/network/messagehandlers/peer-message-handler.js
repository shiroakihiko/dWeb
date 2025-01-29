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
        this.registerHandler('crossNetworkMessage', this.handleCrossNetworkMessage.bind(this));
        
        // Account related handlers
        this.registerHandler('getAccountInfo', this.handleAccountInfoRequest.bind(this));
        //this.registerHandler('getAllBlocksForAccount', this.handleGetAllBlocksForAccountRequest.bind(this));

        // Block related handlers
        this.registerHandler('newBlock', this.handleNewBlock.bind(this));
        this.registerHandler('getBlock', this.handleGetBlockRequest.bind(this));
        this.registerHandler('getAllFrontiers', this.handleFrontiersRequest.bind(this));
        this.registerHandler('getBlocksAfterHash', this.handleGetBlocksAfterHashRequest.bind(this));

        // New container-related handlers
        this.registerHandler('containerProposal', this.handleContainerProposal.bind(this));
        this.registerHandler('containerConfirmation', this.handleContainerConfirmation.bind(this));
        this.registerHandler('getContainers', this.handleGetContainers.bind(this));
        this.registerHandler('getGenesisContainer', this.handleGetGenesisContainer.bind(this));
        this.registerHandler('getContainersAfterHash', this.handleGetContainersAfterHash.bind(this));
        this.registerHandler('getContainer', this.handleGetContainer.bind(this));
        this.registerHandler('getContainerWithBlocks', this.handleGetContainerWithBlocks.bind(this));
        this.registerHandler('getContainersWithBlocks', this.handleGetContainersWithBlocks.bind(this));
        this.registerHandler('getContainerChain', this.handleGetContainerChain.bind(this));
        this.registerHandler('getLastContainerHash', this.handleGetLastContainerHash.bind(this));

        // Add new election handlers
        this.registerHandler('election:vote', this.handleElectionVote.bind(this));
        this.registerHandler('election:request-votes', this.handleVoteRequest.bind(this));
        this.registerHandler('election:vote-response', this.handleVoteResponse.bind(this));

        // Add new reward handlers
        this.registerHandler('createReward', this.handleCreateReward.bind(this));
    }

    // Register a single handler
    registerHandler(action, callback) {
        this.handlers.set(action, callback);
    }

    // The default message handler that takes care
    // of the majority of what a network requires
    async handleMessage(data, socket) {
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

    async handleNewBlock(socket, data) {
        const nodeId = data.nodeId;
        
        // Get clean block without signatures through broadcaster
        const cleanMessage = await this.network.node.broadcaster.receivedMessage(data, nodeId);
        
        // Process the clean block
        const block = cleanMessage.block;
        this.network.node.log(`New block received: ${block.hash} from ${nodeId}`);
        this.network.consensus.pendingBlockManager.blockBroadcaster.handleNewBlock(block, nodeId);
    }

    async handleTelemetryRequest(socket, data) {
        // Send telemetry ack
        const telemetry = await this.network.node.getTelemetryData(this.network.node.networkId);
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

    async handleCrossNetworkMessage(socket, data) {
        const nodeId = data.nodeId;
        const networkMessage = data.data;
        const sourceNetworkId = data.sourceNetworkId;
        const block = networkMessage.block;
        this.network.node.log(`Cross network message from (${sourceNetworkId}) received by ${nodeId}\r\n${JSON.stringify(networkMessage)}`);
        const validBlock = await this.network.blockValidator.validBlock(networkMessage);
        if (!validBlock) {
            this.network.node.warn(`Block ${networkMessage.hash} rejected. Invalid block.`);
            return false;
        }
        this.network.consensus.addBlockToPending(block);
        this.network.consensus.checkAndRequestVotes(true);
    }
    
    async handleGetBlocksAfterHashRequest(socket, data) {
        const account = data.account;
        const lastHash = data.lastHash;
        const blocks = await this.network.ledger.getBlocksAfterHash(account, lastHash);
        this.network.node.sendMessage(socket, {
            type: 'getBlocksAfterHashResponse',
            blocks: blocks,
            reply_id: data.id
        });
    }

    async handleGetAllBlocksForAccountRequest(socket, data) {
        if (data.account)
        {
            const blocks = await this.network.ledger.getAllBlocksForAccount(data.account);
            this.network.node.sendMessage(socket, {
                type: 'getAllBlocksForAccountResponse',
                account: data.account,
                blocks: blocks,
                reply_id: data.id
            });
        }
        else if(data.accounts)
        {
            const accountBlocks = {};
            for (const account of data.accounts)
            {
                const blocks = await this.network.ledger.getAllBlocksForAccount(account);
                accountBlocks[account] = blocks;
            }
                
            this.network.node.sendMessage(socket, {
                type: 'getAllBlocksForAccountResponse',
                accountBlocks: accountBlocks,
                reply_id: data.id
            });
        }
    }
    async handleFrontiersRequest(socket, data) {
        const { start, count } = data;
        const frontiers = await this.network.ledger.getFrontiers(start, count);
        this.network.node.sendMessage(socket, {
            type: 'frontiers_response',
            frontiers: frontiers,
            reply_id: data.id
        });
    }
    async handleGetBlockRequest(socket, data) {
        const block = await this.network.ledger.getBlock(data.hash);
        this.network.node.sendMessage(socket, {
            type: 'getBlockResponse',
            hash: data.hash,
            block: block,
            reply_id: data.id
        });
    }

    async handleAccountInfoRequest(socket, data) {
        const accountHash = data.account;
        const account = await this.network.ledger.getAccount(accountHash);
        this.network.node.sendMessage(socket, {
            type: 'accountResponse',
            account: account,
            reply_id: data.id
        });
    }

    // Handle container proposal from peers
    async handleContainerProposal(socket, data) {
        const nodeId = data.nodeId;
        
        // Get clean proposal without signatures
        const cleanMessage = await this.network.node.broadcaster.receivedMessage(data, nodeId);
        
        const proposal = cleanMessage.proposal;
        this.network.node.log(`Container proposal received from ${nodeId}: ${JSON.stringify(proposal)}`);
        await this.network.consensus.proposalManager.proposalBroadcaster.handleNewProposal(proposal, nodeId);
    }

    // Handle container confirmation from peers
    async handleContainerConfirmation(socket, data) {
        const container = data.container;
        this.network.node.log(`Container confirmation received: ${container.hash}`);
    }

    async handleGetContainers(socket, data) {
        const offset = data.offset || 0;
        const limit = Math.min(data.limit || 50, 100); // Cap at 100 containers
        const containers = [];

        let currentHash = await this.network.ledger.getLastContainerHash();
        let currentOffset = 0;

        // Walk back through the chain to find the requested containers
        while (currentHash && containers.length < limit && currentOffset < offset + limit) {
            const container = await this.network.ledger.getContainer(currentHash);
            if (!container) break;

            if (currentOffset >= offset) {
                containers.unshift(container); // Add to start to maintain order
            }

            currentHash = container.previousContainerHash;
            currentOffset++;
        }

        this.network.node.sendMessage(socket, {
            type: 'containers',
            containers: containers,
            reply_id: data.id
        });
    }

    async handleGetGenesisContainer(socket, data) {
        const genesisHash = await this.network.ledger.getFirstContainerHash();
        if (!genesisHash) return;

        const container = await this.network.ledger.getContainer(genesisHash);
        this.network.node.sendMessage(socket, {
            type: 'genesisContainer',
            container: container,
            reply_id: data.id
        });
    }

    async handleGetContainersAfterHash(socket, data) {
        const limit = Math.min(data.limit || 50, 100); // Cap at 100 containers
        const containers = [];
        let currentHash = data.hash;

        // Get containers that follow the given hash
        while (containers.length < limit) {
            const container = await this.network.ledger.getContainer(currentHash);
            if (!container) break;

            const nextContainer = await this.network.ledger.getContainer(container.nextContainerHash);
            if (!nextContainer) break;

            containers.push(nextContainer);
            currentHash = nextContainer.hash;
        }

        this.network.node.sendMessage(socket, {
            type: 'containers',
            containers: containers,
            reply_id: data.id
        });
    }

    async handleGetContainer(socket, data) {
        const container = await this.network.ledger.getContainer(data.hash);
        this.network.node.sendMessage(socket, {
            type: 'container',
            container: container,
            reply_id: data.id
        });
    }
    async handleGetContainerWithBlocks(socket, data) {
        const container = await this.network.ledger.getContainerWithBlocks(data.hash);
        this.network.node.sendMessage(socket, {
            type: 'containerWithBlocks',
            container: container,
            reply_id: data.id
        });
    }

    async handleGetContainersWithBlocks(socket, data) {
        const containers = [];
        for (const containerHash of data.hashes) {
            const container = await this.network.ledger.getContainerWithBlocks(containerHash);
            if (container) {
                containers.push(container);
            }
        }

        this.network.node.sendMessage(socket, {
            type: 'containersWithBlocks',
            containers: containers,
            reply_id: data.id
        });
    }

    async handleGetContainerChain(socket, data) {
        const startHash = data.startHash; // Optional
        const containers = await this.network.ledger.getContainerChain(startHash);
        
        this.network.node.sendMessage(socket, {
            type: 'containerChain',
            containers: containers,
            reply_id: data.id
        });
    }

    async handleGetLastContainerHash(socket, data) {
        const lastHash = await this.network.ledger.getLastContainerHash();
        this.network.node.sendMessage(socket, {
            type: 'lastContainerHash',
            hash: lastHash,
            reply_id: data.id
        });
    }

    
    // ------------ Voting and Elections ------------

    async handleElectionVote(socket, data) {
        try {
            const nodeId = data.nodeId;
            
            // Get clean vote without signatures
            const cleanMessage = await this.network.node.broadcaster.receivedMessage(data, nodeId);
            
            const vote = cleanMessage.vote;
            if (!vote.electionId || !vote.voterId || !vote.candidateId) {
                throw new Error('Missing required vote fields');
            }

            this.network.node.log(`Election vote received for ${vote.electionId} from ${vote.voterId}`);
            this.network.node.sendMessage(socket, { type: 'election:vote-ack', reply_id: data.id });
            this.network.consensus.electionManager.handleVote(vote, nodeId);
        } catch (err) {
            this.network.node.error('Failed to handle election vote:', err);
        }
    }
    async handleVoteRequest(socket, data) {
        const { electionId } = data;
        const ownVote = this.network.consensus.electionManager.ownVotes.get(electionId);
        if (ownVote) {
            this.network.node.sendMessage(socket, { type: 'election:vote-response', vote: ownVote });
        }
    }
    async handleVoteResponse(socket, data) {
        const { vote } = data;
        await this.network.consensus.electionManager.handleVote(vote, socket.nodeId);
    }

    // ------------ Reward handlers ------------

    async handleCreateReward(data, socket) {
        this.network.node.info(`Cross network message for rewarding received! ${JSON.stringify(data)}`);
        
        const sourceNetworkId = data.sourceNetworkId; 
        const consensusBlock = data.consensusBlock;
        
        //if(sourceNetworkId != '') // Network we accept
        //    return false;

        // Verify all signatures, cross check with the dweb main chain's table of trusted peers for the governance network and verify their 67% quorum
        
        const rewardBlockProcessor = new RewardBlockProcessor(this.network);
        const rewardBlock = await rewardBlockProcessor.createNewBlock(consensusBlock, sourceNetworkId, this.network.node.nodePrivateKey);
        this.network.node.log(`Reward creation state: ${rewardBlock.state}`);
        if(rewardBlock.state == 'VALID')
            this.network.consensus.proposeBlock(rewardBlock.block);
    }
}

module.exports = PeerMessageHandler;
