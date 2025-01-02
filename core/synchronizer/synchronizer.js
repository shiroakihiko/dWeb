const GenesisSyncer = require('./areas/genesissyncer');
const FrontierSyncer = require('./areas/frontiersyncer');

class Synchronizer {
    constructor(network) {
        this.network = network;
        this.syncedAccounts = new Set();  // Track synced accounts
        this.genesisAccountSynced = false; // Flag to track genesis account sync
        this.trustedPeers = [];  // List of trusted peer node IDs
        this.syncInProgress = false;  // Flag to track if a sync operation is in progress

        // Pull every 30 seconds to check synchronization status
        setInterval(() => {
            this.checkSynchronization();
        }, 30000);  // Check every 30 seconds
    }

    // Main synchronization method
    checkSynchronization() {
        if (this.syncInProgress) {
            this.network.node.log('Sync operation in progress.');
            return;
        }

        this.syncInProgress = true; // Set flag to indicate sync operation is in progress

        if (!this.genesisAccountSynced) {
            this.syncGenesisAccount();
        }
    }

    // Sync Genesis Account
    syncGenesisAccount() {
        this.network.node.log('Syncing Genesis Account...');

        // Create and start the GenesisSyncer
        const genesisSyncer = new GenesisSyncer(this.network, this.onGenesisSynced.bind(this));
        genesisSyncer.sync();
    }

    // Called once genesis account is synced
    onGenesisSynced(result) {
        const genesisAccount = result.genesisBlock.toAccount;
        this.trustedPeers = result.trustedPeers;

        this.syncedAccounts.add(genesisAccount);
        this.genesisAccountSynced = true;

        // Sync accounts from trusted peers
        this.syncFrontiers();
    }

    // Sync other accounts based on their frontiers (lastBlockHash)
    syncFrontiers() {
        this.network.node.log('Syncing frontiers from trusted peers');

        // Create and start the FrontierSyncer
        const frontierSyncer = new FrontierSyncer(this.network, this.trustedPeers, this.onAccountsSynced.bind(this));
        frontierSyncer.sync();
    }

    // Called once all accounts have been synced
    onAccountsSynced(result) {
        // Mark sync as finished after frontier sync
        this.syncInProgress = false;
    }
}

module.exports = Synchronizer;
