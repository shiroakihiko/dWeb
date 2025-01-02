// Todo: #1: not all blocks need to be requested from all peers
//       a random peer with range request would be better
//       (e.g. account blocks 0-100 from peer 1, 100-200 from peer2, account1 from trusted random peer1, account2 from trusted random peer2)
//       #2: re-requesting in case no node has been available, starting over with new peers after some time
//           otherwise the synchronization callback never fires, delaying or preventing the network block updates.
class FrontierSyncer {
    constructor(network, trustedPeers, onAccountsSyncedCallback) {
        this.network = network;
        this.trustedPeers = trustedPeers;
        this.onAccountsSynced = onAccountsSyncedCallback;
        this.frontiersToSync = new Set(); // Accounts with mismatched frontiers
    }

    sync() {
        this.network.node.log('Requesting frontiers from trusted peers');

        for (const peer in this.trustedPeers) {
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
            }
            else
            {
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

        this.network.node.log(`Requesting blocks for accounts: ${accountsToSync.join(', ')}`);

        this.network.node.sendAll({
            type: 'getAllBlocksForAccount',  // Request blocks for multiple accounts
            accounts: accountsToSync
        }, this.onAccountBlocksReceived.bind(this));
    }

    async onAccountBlocksReceived(response) {
        this.network.node.log('Received blocks for accounts');

        if (response.error) {
            this.network.node.error('Error receiving blocks for accounts');
            return;
        }

        try {
            const accountBlocks = response.accountBlocks;  // Example: { account1: [block1, block2], account2: [block1, block2] }
            if(accountBlocks)
            {
                for (const account in accountBlocks)
                {
                    let blocks = accountBlocks[account];
                    if(blocks)
                    {
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
                            if (localFrontierBlock && localFrontierBlock.hash === peerFrontierBlock.hash)
                            {
                                this.network.node.verbose(`Account ${account} synced up.`);
                                this.frontiersToSync.delete(account);
                            }
                            else
                                this.network.node.verbose(`Account ${account} could not get synced up.`);
                        }
                    }
                }
            }
        } catch (error) {
            this.network.node.error('Error during block sync:', error);
        }

        // Fire the callback if nothing is left to synchronize
        if(this.frontiersToSync.size == 0)
        {
            this.onAccountsSynced();
            this.network.node.log('Blocks synced and accounts updated.');
        }
        else
        {
            // Call for the blocks for the remaining accounts
            setTimeout(()=>{ this.syncAccountsWithMismatchedFrontiers(); }, 30000);
        }
    }
}

module.exports = FrontierSyncer;
