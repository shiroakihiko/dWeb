class FrontierSyncer {
    constructor(network, trustedPeers, onAccountsSyncedCallback) {
        this.network = network;
        this.trustedPeers = Object.keys(trustedPeers); // Get the keys (peer addresses) from the trusted peers object
        this.onAccountsSynced = onAccountsSyncedCallback;
        this.frontiersToSync = new Set(); // Accounts with mismatched frontiers
        this.retryDelay = 30000; // Delay before retrying (30 seconds)
    }

    async sync() {
        this.network.node.log('Requesting frontiers from peers');

        // Get all peers from peerManager (including trusted and others)
        const allPeers = this.getAllPeers();

        // Start frontier sync process with all peers
        this.attemptFrontierRequest(allPeers);
    }

    getAllPeers() {
        return Array.from(this.network.node.GetPeers().peerManager.connectedNodes.keys());
    }

    attemptFrontierRequest(peers) {
        // Send requests to all available peers
        for (const peer of peers) {
            this.network.node.sendToPeer(peer, {
                type: 'getAllFrontiers'  // Request all frontiers from this peer
            }, this.onFrontiersReceived.bind(this));
        }
    }

    onFrontiersReceived(response) {
        this.network.node.log('Frontiers received from peer');

        if (response.error) {
            this.network.node.error('Error receiving frontiers from peer');
            return;
        }

        const frontiers = response.frontiers;  // Example: { account1: 'frontier_hash', account2: 'frontier_hash' }

        // Compare received frontiers with local frontiers
        for (const frontier of frontiers) {
            const account = frontier.account;
            const localFrontier = this.network.ledger.getLastBlockHash(account);
            const peerFrontier = frontier.lastBlockHash;

            if (localFrontier !== peerFrontier) {
                this.network.node.verbose(`Account ${account} has a frontier mismatch. Requesting blocks...`);
                this.frontiersToSync.add(account);
            } else {
                this.network.node.verbose(`Account ${account} already synced up.`);
            }
        }

        // Request blocks for accounts that need sync
        this.syncAccountsWithMismatchedFrontiers();
    }

    syncAccountsWithMismatchedFrontiers() {
        const accountsToSync = Array.from(this.frontiersToSync);
        if (accountsToSync.length === 0) {
            this.network.node.log('All accounts are in sync!');
            this.onAccountsSynced();
            return;
        }

        // Get all available peers (trusted + others)
        const peers = this.getAllPeers();

        // Distribute accounts across peers
        const peerRequests = this.getPeerRequests(accountsToSync, peers);

        this.network.node.log(`Requesting blocks for accounts: ${accountsToSync.join(', ')}`);
        peerRequests.forEach(peerRequest => {
            this.network.node.sendToPeer(peerRequest.peer, {
                type: 'getAllBlocksForAccount',
                accounts: peerRequest.accounts
            }, this.onAccountBlocksReceived.bind(this));
        });
    }

    getPeerRequests(accountsToSync, peers) {
        const peerRequests = [];
        const totalPeers = peers.length;
        const accountsPerPeer = Math.ceil(accountsToSync.length / totalPeers); // Calculate accounts per peer

        let accountIndex = 0;
        for (let i = 0; i < totalPeers; i++) {
            const peer = peers[i];
            // Slice accounts for this peer
            const accountsForPeer = accountsToSync.slice(accountIndex, accountIndex + accountsPerPeer);
            accountIndex += accountsPerPeer;

            peerRequests.push({
                peer,
                accounts: accountsForPeer
            });
        }

        return peerRequests;
    }

    async onAccountBlocksReceived(response) {
        this.network.node.log('Received blocks for accounts');

        if (response.error) {
            this.network.node.error('Error receiving blocks for accounts');
            return;
        }

        try {
            const accountBlocks = response.accountBlocks;  // Example: { account1: [block1, block2], account2: [block1, block2] }
            if (accountBlocks) {
                for (const account in accountBlocks) {
                    let blocks = accountBlocks[account];
                    if (blocks) {
                        // Blocks are in descending order (end to start)
                        // Reverse the blocks to process them from last to first
                        blocks = blocks.reverse();

                        // Extract trusted peers (networkValidatorWeights)
                        const peerFrontierBlock = blocks[blocks.length - 1]; // The frontier (lastBlock) of the account
                        const localFrontierBlock = this.network.ledger.getLastBlockForAccount(account);

                        // Already synced up?
                        if (localFrontierBlock && localFrontierBlock.hash === peerFrontierBlock.hash) {
                            this.network.node.verbose(`Account ${account} synced up.`);
                            this.frontiersToSync.delete(account);
                        } else {
                            // Sync up the blocks
                            // Wait for all blocks to be processed sequentially
                            await this.network.blockManager.addBlocks(blocks);
                            if (localFrontierBlock && localFrontierBlock.hash === peerFrontierBlock.hash) {
                                this.network.node.verbose(`Account ${account} synced up.`);
                                this.frontiersToSync.delete(account);
                            } else {
                                this.network.node.verbose(`Account ${account} could not get synced up.`);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.network.node.error('Error during block sync:', error);
        }

        // Fire the callback if nothing is left to synchronize
        if (this.frontiersToSync.size == 0) {
            this.onAccountsSynced();
            this.network.node.log('Blocks synced and accounts updated.');
        } else {
            // Call for the blocks for the remaining accounts
            setTimeout(() => { this.syncAccountsWithMismatchedFrontiers(); }, 30000);
        }
    }
}

module.exports = FrontierSyncer;
