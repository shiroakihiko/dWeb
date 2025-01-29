const ContainerSyncer = require('./containers/sync');

class Synchronizer {
    constructor(network) {
        this.network = network;
        this.containerSyncer = null;
        this.checkTimer = null;
        this.syncState = {
            isSyncing: false,
            lastKnownPeerContainer: null,
            fallenBehind: false,
            lastSyncCheck: 0,
            syncCheckInterval: 30000, // Check every 30 seconds
            minPeerConsensus: 0.50    // Require 50% of peers to agree
        };
    }

    /**
     * Start the synchronization process
     */
    start() {
        // Start periodic sync checks
        setInterval(() => this.checkSyncStatus(), this.syncState.syncCheckInterval);
    }

    /**
     * Stop the synchronization process
     */
    stop() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }

        if (this.containerSyncer) {
            this.containerSyncer.stop();
            this.containerSyncer = null;
        }

        this.syncState.isSyncing = false;
    }

    /**
     * Start a new synchronization cycle
     */
    startSync() {
        this.network.node.log('Starting network synchronization');

        // Create new container syncer
        this.containerSyncer = new ContainerSyncer(
            this.network,
            this.onSyncComplete.bind(this)
        );

        // Start the sync process
        this.containerSyncer.sync().catch(error => {
            this.network.node.error('Error during sync:', error);
            this.syncState.isSyncing = false;
        });
    }

    /**
     * Called when synchronization is complete
     */
    onSyncComplete() {
        this.network.node.log('Network synchronization complete');
        this.network.consensus.validatorSelector.onNewContainer(); // Have validator selector select the present validator of the latest container
        this.containerSyncer = null;
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
        
        this.network.node.log('Checking sync status');
        this.syncState.lastSyncCheck = now;

        // Check if we have genesis container
        const genesisContainer = await this.network.ledger.getContainerWithBlocks(this.network.networkId);
        if (genesisContainer) {
            return await this.checkSyncByWeight();
        } else {
            return await this.checkSyncByPeerConsensus();
        }
    }

    /**
     * Check sync status based on voting weight when we have genesis container
     * @returns {boolean} True if we're behind, false otherwise
     */
    async checkSyncByWeight() {
        const ourLastHash = await this.network.ledger.getLastContainerHash();
        const peers = Array.from(this.network.node.peers.peerManager.connectedNodes.keys());
        
        if (peers.length === 0) {
            return this.syncState.isSyncing;
        }

        // Get latest container hash and weight from all peers
        const peerResponses = await Promise.all(
            peers.map(async (peerId) => {
                try {
                    const response = await this.network.node.sendToPeerAsync(peerId, {
                        type: 'getLastContainerHash'
                    });

                    if (!response || response.error || !response.hash) {
                        return null;
                    }

                    const weight = await this.network.ledger.getVoteWeight(peerId);
                    return {
                        peerId,
                        hash: response.hash,
                        weight: weight || 0
                    };
                } catch (err) {
                    this.network.node.error('Error getting last container hash from peer:', err);
                    return null;
                }
            })
        );

        // Filter out failed responses
        const validResponses = peerResponses.filter(r => r !== null);
        if (validResponses.length === 0) {
            return this.syncState.isSyncing;
        }

        // Group responses by hash with accumulated weight
        const hashGroups = new Map(); // hash -> { weight, peers[] }
        const totalWeight = await this.network.ledger.getTotalVoteWeight();

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

        // Find hash with highest weight
        let consensusHash = null;
        let highestWeight = 0;

        for (const [hash, group] of hashGroups) {
            if (group.weight > highestWeight) {
                highestWeight = group.weight;
                consensusHash = hash;
            }
        }

        if (!consensusHash) {
            return this.syncState.isSyncing;
        }

        // Calculate weight percentage
        const weightPercentage = highestWeight / totalWeight;
        
        // Check if we need to sync based on weight thresholds
        const isBehind = consensusHash !== ourLastHash && 
            (weightPercentage >= 0.67 || // 67% of total weight agrees
             (weightPercentage >= 0.50 && validResponses.length === 1)); // Single peer with >=50% weight

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

        // Update sync state and start sync if needed
        const previousState = this.syncState.isSyncing;
        this.syncState.isSyncing = isBehind;
        this.syncState.fallenBehind = isBehind;

        if (isBehind && !previousState) {
            this.network.node.warn('Node has fallen behind network weight consensus, starting sync');
            this.startSync();
        }

        return isBehind;
    }

    /**
     * Check sync status based on peer count when we don't have genesis container
     * @returns {boolean} True if we're behind, false otherwise
     */
    async checkSyncByPeerConsensus() {
        const ourLastHash = await this.network.ledger.getLastContainerHash();
        const peers = Array.from(this.network.node.peers.peerManager.connectedNodes.keys());
        
        if (peers.length === 0) {
            return this.syncState.isSyncing;
        }

        // Get latest container hash from all peers
        const peerResponses = await Promise.all(
            peers.map(async (peerId) => {
                try {
                    const response = await this.network.node.sendToPeerAsync(peerId, {
                        type: 'getLastContainerHash'
                    });

                    if (!response || response.error || !response.hash) {
                        return null;
                    }

                    return {
                        peerId,
                        hash: response.hash
                    };
                } catch (err) {
                    this.network.node.error('Error getting last container hash from peer:', err);
                    return null;
                }
            })
        );

        // Filter out failed responses
        const validResponses = peerResponses.filter(r => r !== null);
        if (validResponses.length === 0) {
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

        // Update sync state
        const previousState = this.syncState.isSyncing;
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
