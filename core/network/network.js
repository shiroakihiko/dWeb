const Ledger = require('../ledger/ledger.js');
const DPoSConsensus = require('../consensus/dpos/consensus.js');
const GenesisBlockProcessor = require('../blockprocessors/genesis/genesis.js');
const NetworkBlockProcessor = require('../blockprocessors/network/network.js');
const Synchronizer = require('../synchronizer/synchronizer.js');
const BlockManager = require('../blockprocessors/blockmanager.js');

const fs = require('fs');

class Network {
    constructor(config)
    {
        this.blockManager = new BlockManager(this);
        this.ledger = new Ledger(config.dbPath);
        this.consensus = new DPoSConsensus(this);
        this.synchronizer = new Synchronizer(this);

        if(config.networkId)
            this.networkId = config.networkId;
    }

    async createNetwork(config)
    {
        const genesis = new GenesisBlockProcessor(this);
        const result = await genesis.createNewBlock({webName: config.webName, initialSupply: 1, decimals: '100000000', data: 'GenesisBlock!!'});
        if (result.state == 'VALID')
            return result.block.hash;

        return null;
    }

    Start(node)
    {
        this.node = node;
    }

    // Add additional data to telemetry
    getTelemetryData()
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

module.exports = Network;
