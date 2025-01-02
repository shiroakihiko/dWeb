const WebSocket = require('ws');

class PeerMessageHandler {

    constructor(network) {
        this.network = network;
    }

    // The default message handler that takes care
    // of the majority of what a network requires
    async handleMessage(data, socket) {
        try {
            if (data.type === 'telemetry') {
                this.handleTelemetryRequest(socket, data);
                return true;
            } else if (data.type === 'peer_list') {
                this.handlePeerList(socket);
                return true;
            } else if (data.type === 'blockVotes') {
                this.handleBlockVotes(socket, data);
                return true;
            } else if (data.type === 'getBlock') {
                this.handleGetBlockRequest(socket, data);
                return true;
            } else if (data.type === 'getAllFrontiers') {
                this.handleFrontiersRequest(socket, data);
                return true;
            } else if (data.type === 'getAllBlocksForAccount') {
                this.handleGetAllBlocksForAccountRequest(socket, data);
                return true;
            } else if (data.type === 'account') {
                this.handleAccountRequest(socket, data);
                return true;
            } else if (data.type === 'block_range') {
                this.handleBlockRangeRequest(socket, data);
                return true;
            } else if (data.type === 'crossNetworkMessage') {
                this.handleCrossNetworkMessage(socket, data);
                return true;
            }
        } catch(err) {
            this.network.node.error('Peer Request Error', err);
            return true;
        }

        return false;
    }

    handleNewBlock(block, socket) {
        const lastBlock = this.network.getLastBlock();
        if (!lastBlock || block.id > lastBlock.id) {
            this.network.node.log('Received new block:', block);
            this.network.addBlock(block);

            // Broadcast the new block to other peers (broadcast logic not shown here)
            this.network.node.log('Broadcasting new block:', block);
        }
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

    handleBlockVotes(socket, data) {
        const nodeId = data.nodeId;
        const blocks = data.blocks;
        this.network.node.log(`Block votes received by ${nodeId}\r\n${JSON.stringify(data)}`);
        this.network.consensus.blockVotesReceived(nodeId, blocks);
    }

    handleCrossNetworkMessage(socket, data) {
        const nodeId = data.nodeId;
        const networkMessage = data.data;
        const sourceNetworkId = data.sourceNetworkId;
        this.network.node.log(`Cross network message from (${sourceNetworkId}) received by ${nodeId}\r\n${JSON.stringify(networkMessage)}`);

        if (!this.network.blockValidator.validBlock(block)) {
            this.network.node.warn(`Block ${block.hash} rejected. Invalid block.`);
            return false;
        }
        this.network.consensus.addBlockToPending(block);
        this.network.consensus.checkAndRequestVotes(true);
    }

    handleGetAllBlocksForAccountRequest(socket, data) {
        if (data.account)
        {
            const blocks = this.network.ledger.getAllBlocksForAccount(data.account);
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
                const blocks = this.network.ledger.getAllBlocksForAccount(account);
                accountBlocks[account] = blocks;
            }
                
            this.network.node.sendMessage(socket, {
                type: 'getAllBlocksForAccountResponse',
                accountBlocks: accountBlocks,
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
    handleGetBlockRequest(socket, data) {
        const block = this.network.ledger.getBlock(data.hash);
        this.network.node.sendMessage(socket, {
            type: 'getBlockResponse',
            hash: data.hash,
            block: block,
            reply_id: data.id
        });
    }

    handleAccountRequest(socket, data) {
        const accountHash = data.account;
        const account = this.network.ledger.getAccount(accountHash);
        this.network.node.sendMessage(socket, {
            type: 'account_response',
            account: account,
            reply_id: data.id
        });
    }

    handleBlockRangeRequest(socket, data) {
        const { startHash, count } = data;
        const blocks = this.network.ledger.getBlocksInRange(startHash, count);
        this.network.node.sendMessage(socket, {
            type: 'block_range_response',
            blocks: blocks,
            reply_id: data.id
        });
    }
}

module.exports = PeerMessageHandler;
