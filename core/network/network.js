const fs = require('fs');
const Ledger = require('../ledger/ledger.js');
const DPoSConsensus = require('../consensus/dpos/consensus.js');
const GenesisInstruction = require('../system/instruction/types/genesis/genesis.js');
const NetworkInstruction = require('../system/instruction/types/network/network.js');
const Synchronizer = require('../synchronizer/synchronizer.js');
const ActionManager = require('../system/actionmanager.js');

// Swap instructions
const SwapOfferInstruction = require('../system/instruction/types/swap/offer/offer.js');
const SwapClaimInstruction = require('../system/instruction/types/swap/claim/claim.js');
const SwapRefundInstruction = require('../system/instruction/types/swap/refund/refund.js');
const SwapCancelInstruction = require('../system/instruction/types/swap/cancel/cancel.js');

const RewardInstruction = require('../system/instruction/types/rewards/contribution/reward.js');

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
        this.actionManager = new ActionManager(this);
        this.consensus = new DPoSConsensus(this);
        this.synchronizer = new Synchronizer(this);
        
        // Register default instructions
        this.actionManager.registerInstructionType('swapOffer', new SwapOfferInstruction(this));
        this.actionManager.registerInstructionType('swapClaim', new SwapClaimInstruction(this));
        this.actionManager.registerInstructionType('swapRefund', new SwapRefundInstruction(this));
        this.actionManager.registerInstructionType('swapCancel', new SwapCancelInstruction(this));
        this.actionManager.registerInstructionType('reward', new RewardInstruction(this));
    }

    async createNetwork(config)
    {
        const genesis = this.actionManager.getInstructionProcessor('genesis');
        const result = await genesis.createGenesis({webName: config.webName, initialSupply: 1, decimals: '100000000', data: 'GenesisBlock!!'});
        if (result.state == 'VALID')
            return result.block.hash;

        return null;
    }

    Start(node)
    {
        this.node = node;
        if(this.synchronizer)
            this.synchronizer.Start();
        if(this.consensus)
            this.consensus.initialize();
    }

    Stop()
    {
        if(this.ledger)
            this.ledger.Stop();
        if(this.synchronizer)
            this.synchronizer.Stop();
        if(this.consensus)
            this.consensus.Stop();
        if(this.actionManager)
            this.actionManager.Stop();
    }

    // Add additional data to telemetry
    getTelemetryData()
    {
        if(!this.ledger)
            return {};

        return {
            actionCount: this.ledger.getTotalActionCount(),
            pendingActionCount: this.consensus.pendingActionManager.getPendingActionCount(),
            pendingBlockCount: this.consensus.proposalManager.getPendingBlockCount(),
            lastBlockHash: this.ledger.getLastBlockHash(),
            blockCount: this.ledger.getTotalBlockCount(),
            accountCount: this.ledger.getTotalAccountCount(),
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
        if (this.synchronizer.syncState.fallenBehind)
            return;

        const createResult = await this.actionManager.createAction({type: 'network', account: this.ledger.getGenesisAccount()}); 
        if(createResult.state == 'VALID')
        {
            this.node.info('Proposing new network update action');
            this.consensus.proposeAction(createResult.action);
        }
        else if(createResult.state !== 'TOO_EARLY')
        {
            this.node.error('Failed to create new network update action', createResult);
        }
    }
}

module.exports = Network;
