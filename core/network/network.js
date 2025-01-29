const Ledger = require('../ledger/ledger.js');
const DPoSConsensus = require('../consensus/dpos/consensus.js');
const GenesisBlockProcessor = require('../blockprocessors/genesis/genesis.js');
const NetworkBlockProcessor = require('../blockprocessors/network/network.js');
const Synchronizer = require('../synchronizer/synchronizer.js');
const BlockManager = require('../blockprocessors/blockmanager.js');

// Swap block processors
const SwapOfferBlockProcessor = require('../blockprocessors/swap/offer/offer.js');
const SwapClaimBlockProcessor = require('../blockprocessors/swap/claim/claim.js');
const SwapRefundBlockProcessor = require('../blockprocessors/swap/refund/refund.js');
const SwapCancelBlockProcessor = require('../blockprocessors/swap/cancel/cancel.js');

const fs = require('fs');

class Network {
    constructor(config, ledger=null)
    {
        this.config = config;
        if(config.networkId)
            this.networkId = config.networkId;

        this.ledger = ledger;
    }

    async initialize()
    {
        this.ledger = this.ledger || new Ledger(this.config.dbPath);
        await this.ledger.initialize();
        this.blockManager = new BlockManager(this);
        this.consensus = new DPoSConsensus(this);
        this.synchronizer = new Synchronizer(this);
        
        // Add swap block processors
        this.blockManager.addProcessor('swapOffer', new SwapOfferBlockProcessor(this));
        this.blockManager.addProcessor('swapClaim', new SwapClaimBlockProcessor(this));
        this.blockManager.addProcessor('swapRefund', new SwapRefundBlockProcessor(this));
        this.blockManager.addProcessor('swapCancel', new SwapCancelBlockProcessor(this));
    }

    async createNetwork(config)
    {
        const genesis = new GenesisBlockProcessor(this);
        const result = await genesis.createNewBlock({webName: config.webName, initialSupply: 1, decimals: '100000000', data: 'GenesisBlock!!'});
        if (result.state == 'VALID')
            return result.container.hash;

        return null;
    }

    Start(node)
    {
        this.node = node;
        if(this.synchronizer)
            this.synchronizer.start();
        if(this.consensus)
            this.consensus.initialize();
    }

    // Add additional data to telemetry
    async getTelemetryData()
    {
        if(!this.ledger)
            return {};

        return {
            blockCount: await this.ledger.getTotalBlockCount(),
            pendingBlockCount: await this.consensus.pendingBlockManager.getPendingBlockCount(),
            pendingContainerCount: await this.consensus.proposalManager.getPendingContainerCount(),
            accountCount: await this.ledger.getTotalAccountCount(),
            connectedPeers: this.node.peers.peerManager.getConnectedAddresses(),
            peerCount: this.node.peers.peerManager.connectedPeers.size,
            protocolVersion: '0.7.0'
        };
    }

    // Periodically the network updates will be writen into the ledger in consensus with other peers
    async sendNetworkUpdates()
    {
        if(!this.ledger)
            return;
        if (this.synchronizer.syncState.isSyncing || !this.synchronizer.syncState.lastKnownPeerContainer)
            return;

        const networkUpdate = new NetworkBlockProcessor(this);
        const newBlock = await networkUpdate.createNewBlock();
        if(newBlock.state == 'VALID')
        {
            this.consensus.proposeBlock(newBlock.block, (block)=>{
                // broadcast to other networks
                this.node.sendOtherNetworks(block);
            });
        }
    }
}

module.exports = Network;
