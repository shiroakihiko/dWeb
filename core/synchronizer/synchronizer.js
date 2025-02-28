const BlockSyncer = require('./blocks/sync');

class Synchronizer {
    constructor(network) {
        this.network = network;
        this.blockSyncer = null;
        this.checkTimer = null;
        this.syncState = {
            isSyncing: false,
            lastKnownPeerBlock: null,
            fallenBehind: false,
            lastSyncCheck: 0,
            syncCheckInterval: 20000, // Check every 20 seconds
            minPeerConsensus: 0.50    // Require 50% of peers to agree
        };
    }

    /**
     * Start the synchronization process
     */
    Start() {
        // Start periodic sync checks
        this.checkTimer = setInterval(() => this.checkSyncStatus(), this.syncState.syncCheckInterval);
    }

    /**
     * Stop the synchronization process
     */
    Stop() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }

        if (this.blockSyncer) {
            this.blockSyncer.Stop();
            this.blockSyncer = null;
        }

        this.syncState.isSyncing = false;
    }

    /**
     * Start a new synchronization cycle
     */
    startSync() {
        this.network.node.log('Starting network synchronization');

        // Create new block syncer
        this.blockSyncer = new BlockSyncer(
            this.network,
            this.onSyncComplete.bind(this)
        );

        // Start the sync process
        this.blockSyncer.sync().catch(error => {
            this.network.node.error('Error during sync:', error);
            this.syncState.isSyncing = false;
        });
    }

    /**
     * Called when synchronization is complete
     */
    onSyncComplete() {
        this.network.node.log('Network synchronization complete');
        this.network.consensus.validatorSelector.onNewBlock(); // Have validator selector select the present validator of the latest block
        this.blockSyncer = null;
        this.syncState.isSyncing = false;
        this.syncState.fallenBehind = false;
    }

    /**
     * Check if we're behind based on peer consensus or voting weight
     * @returns {boolean} True if we're behind, false otherwise
     */
    async checkSyncStatus() {
        const now = Date.now();
        if (now - this.syncState.lastSyncCheck < this.syncState.syncCheckInterval) {
            return this.syncState.isSyncing;
        }
        
        this.syncState.lastSyncCheck = now;

        // Check if we have genesis block
        const genesisBlock = this.network.ledger.getBlockWithActions(this.network.networkId);
        if (genesisBlock) {
            return await this.checkSyncByWeight();
        } else {
            return await this.checkSyncByPeerConsensus();
        }
    }

    /**
     * Check sync status based on voting weight when we have genesis block
     * @returns {boolean} True if we're behind, false otherwise
     */
    async checkSyncByWeight() {
        const ourLastHash = this.network.ledger.getLastBlockHash();
        const peers = Array.from(this.network.node.peers.peerManager.connectedNodes.keys());
        
        if (peers.length === 0) {
            this.network.node.warn('No peers connected, skipping sync check');
            return this.syncState.isSyncing;
        }

        // Get latest block hash and weight from all peers
        const peerResponses = await Promise.all(
            peers.map(async (peerId) => {
                try {
                    if(this.network.node.nodeId === peerId) {
                        return null;
                    }

                    const response = await this.network.node.sendToPeerAsync(peerId, {
                        type: 'getLastBlockHash'
                    });

                    if (!response || response.error || !response.hash) {
                        return null;
                    }

                    const weight = this.network.ledger.getVoteWeight(peerId);
                    return {
                        peerId,
                        hash: response.hash,
                        weight: weight || 0
                    };
                } catch (err) {
                    this.network.node.error('Error getting last block hash from peer:', err);
                    return null;
                }
            })
        );

        // Filter out failed responses
        const validResponses = peerResponses.filter(r => r !== null);
        if (validResponses.length === 0) {
            this.network.node.warn('No valid responses from peers, skipping sync check');
            return this.syncState.isSyncing;
        }

        // Group responses by hash with accumulated weight
        const hashGroups = new Map(); // hash -> { weight, peers[] }
        const totalWeight = this.network.ledger.getTotalVoteWeight();

        for (const response of validResponses) {
            if (!hashGroups.has(response.hash)) {
                hashGroups.set(response.hash, {
                    weight: 0,
                    peers: []
                });
            }
            const group = hashGroups.get(response.hash);
            group.weight += parseFloat(response.weight);
            group.peers.push(response.peerId);
        }

        // Find hash with highest weight.
        // In case of a tie, if our own hash is selected then prefer the alternative hash.
        let consensusHash = null;
        let highestWeight = 0;

        for (const [hash, group] of hashGroups) {
            // Skip over any hashes that we already have, peers that are we are already synced up to with
            if(this.network.ledger.getBlock(hash)) {
                continue;
            }

            if (group.weight > highestWeight) {
                highestWeight = group.weight;
                consensusHash = hash;
            } else if (group.weight === highestWeight && consensusHash === ourLastHash && hash !== ourLastHash) {
                // Tie-breaker: if our hash is currently selected and we find an alternative with equal weight,
                // choose the other party's hash assuming we don't have that block already.
                consensusHash = hash;
            }
        }
        
        if (!consensusHash) {
            this.network.node.warn('No consensus hash found, skipping sync check');
            return this.syncState.isSyncing;
        }

        // Calculate weight percentage
        const weightPercentage = highestWeight / totalWeight;
        
        // Check if we need to sync based on weight thresholds
        const isBehind = consensusHash !== ourLastHash && 
            (weightPercentage >= 0.67 || // 67% of total weight agrees
             (weightPercentage >= 0.30 && validResponses.length <= 2)); // Single peer with >=30% weight

        if (isBehind) {
            const consensusGroup = hashGroups.get(consensusHash);

            this.network.node.log(
                `Network weight consensus differs from our state:` +
                `\n- Our last hash: ${ourLastHash}` +
                `\n- Network consensus hash: ${consensusHash}` +
                `\n- Supporting peers: ${consensusGroup.peers.length}` +
                `\n- Supporting weight: ${(weightPercentage * 100).toFixed(1)}%`
            );
        }
        else {
            this.network.node.info('Node is in sync with the network (consensusHash: ' + consensusHash + ')');
        }

        // Update sync state and start sync if needed
        const previousState = this.syncState.isSyncing;
        this.syncState.lastKnownPeerBlock = consensusHash;
        this.syncState.isSyncing = isBehind;
        this.syncState.fallenBehind = isBehind;

        if (isBehind && !previousState) {
            this.network.node.warn('Node has fallen behind network weight consensus, starting sync');
            this.startSync();
        }

        return isBehind;
    }

    /**
     * Check sync status based on peer count when we don't have genesis block
     * @returns {boolean} True if we're behind, false otherwise
     */
    async checkSyncByPeerConsensus() {
        const ourLastHash = this.network.ledger.getLastBlockHash();
        const peers = Array.from(this.network.node.peers.peerManager.connectedNodes.keys());
        if (peers.length === 0) {
            this.network.node.warn('No peers connected, skipping sync check');
            return this.syncState.isSyncing;
        }

        // Get latest block hash from all peers
        const peerResponses = await Promise.all(
            peers.map(async (peerId) => {
                try {
                    if(this.network.node.nodeId === peerId) {
                        return null;
                    }

                    const response = await this.network.node.sendToPeerAsync(peerId, {
                        type: 'getLastBlockHash'
                    });

                    if (!response || response.error || !response.hash) {
                        return null;
                    }

                    return {
                        peerId,
                        hash: response.hash
                    };
                } catch (err) {
                    this.network.node.error('Error getting last block hash from peer:', err);
                    return null;
                }
            })
        );

        // Filter out failed responses
        const validResponses = peerResponses.filter(r => r !== null);
        if (validResponses.length === 0) {
            this.network.node.warn('No valid responses from peers, skipping sync check');
            return this.syncState.isSyncing;
        }

        // Group responses by hash
        const hashGroups = new Map(); // hash -> { count, peers[] }
        for (const response of validResponses) {
            if (!hashGroups.has(response.hash)) {
                hashGroups.set(response.hash, {
                    count: 0,
                    peers: []
                });
            }
            const group = hashGroups.get(response.hash);
            group.count++;
            group.peers.push(response.peerId);
        }

        // Find hash with highest peer count
        let consensusHash = null;
        let highestCount = 0;

        for (const [hash, group] of hashGroups) {
            if (group.count > highestCount) {
                highestCount = group.count;
                consensusHash = hash;
            }
        }

        // Check if we have sufficient peer consensus (50%)
        const consensusPercentage = highestCount / validResponses.length;
        const isBehind = consensusHash !== ourLastHash && 
                        consensusPercentage >= this.syncState.minPeerConsensus;

        if (isBehind) {
            const consensusGroup = hashGroups.get(consensusHash);
            this.network.node.log(
                `Network peer consensus differs from our state:` +
                `\n- Our last hash: ${ourLastHash}` +
                `\n- Network consensus hash: ${consensusHash}` +
                `\n- Supporting peers: ${consensusGroup.count}/${validResponses.length}` +
                `\n- Consensus percentage: ${(consensusPercentage * 100).toFixed(1)}%`
            );
        }
        else {
            this.network.node.info('Node is in sync with the network (consensusHash: ' + consensusHash + ')');
        }

        // Update sync state
        const previousState = this.syncState.isSyncing;
        this.syncState.lastKnownPeerBlock = consensusHash;
        this.syncState.isSyncing = isBehind;
        this.syncState.fallenBehind = isBehind;

        if (isBehind && !previousState) {
            this.network.node.warn('Node has fallen behind network peer consensus, starting sync');
            this.startSync();
        }

        return isBehind;
    }
}

module.exports = Synchronizer;
