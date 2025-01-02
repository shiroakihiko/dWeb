const LMDB = require('lmdb');
const Ledger = require('../../core/ledger/ledger.js');
const DPoSConsensus = require('../../core/consensus/dpos/consensus.js');
const GenesisBlockProcessor = require('../../core/blockprocessors/genesis/genesis.js');
const NetworkBlockProcessor = require('../../core/blockprocessors/network/network.js');
const PostBlockProcessor = require('./core/blockprocessors/post/post.js');
const Synchronizer = require('../../core/synchronizer/synchronizer.js');
const RPCMessageHandler = require('./network/rpc-message-handler.js');
const BlockManager = require('../../core/blockprocessors/blockmanager.js');

const fs = require('fs');

class Social {
    constructor(config)
    {
        if(config.testSync)
        {
            fs.rmdir(config.dbPath, { recursive: true, force: true }, (err) => {
                if (err) {
                    console.error('Error deleting folder:', err);
                } else {
                    console.log('Folder deleted successfully');
                }
            });
        }
        this.blockManager = new BlockManager(this);
        this.ledger = new Ledger(config.dbPath);
        this.consensus = new DPoSConsensus(this);
        this.synchronizer = new Synchronizer(this);

        this.blockManager.addProcessor('post', new PostBlockProcessor(this));
    }

    async createNetwork(config)
    {
        const genesis = new GenesisBlockProcessor(this);
        const result = await genesis.createNewBlock({webName: config.webName, initialSupply: 1000000, decimals: '100000000', data: 'GenesisBlock!!'});
        if (result.state == 'VALID')
            return result.block.hash;

        return null;
    }

    Start(node)
    {
        this.node = node;
        this.rpcMessageHandler = new RPCMessageHandler(this);
        node.AddRPCMessageHandler(this.rpcMessageHandler);
    }

    // Add additional data to telemetry
    OnTelemetrySend()
    {
        return {
            blockCount: this.ledger.getTotalBlockCount(),
            pendingCount: this.consensus.getPendingCount(),
            accountCount: this.ledger.getTotalAccountCount(),
            connectedPeers: this.node.peers.peerManager.getConnectedAddresses(),
            peerCount: this.node.peers.peerManager.connectedPeers.size,
            protocolVersion: '0.6.0'
        };
    }

    // Periodically the network updates will be writen into the ledger in consensus with other peers
    sendNetworkUpdates()
    {
        if (!this.synchronizer.genesisAccountSynced)
            return;

        const networkUpdate = new NetworkBlockProcessor(this);
        const newBlock = networkUpdate.createNewBlock();
        if(newBlock.state == 'VALID')
            this.consensus.proposeBlock(newBlock.block);
    }
}

module.exports = Social;
