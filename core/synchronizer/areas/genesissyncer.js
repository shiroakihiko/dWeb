const BlockHelper = require('../../utils/blockhelper');

/// Todo:
/// Range requesting and lastBlockHash submission needs to be added, so we do not fetch all blocks but rather from a starting point and in chunks.

// The genesis account is holding the list of trusted peers
// This one should be synced up first so we get the list
// of the peers and their voting weight
class GenesisSyncer {
    constructor(network, onGenesisSyncedCallback) {
        this.network = network;
        this.onGenesisSynced = onGenesisSyncedCallback;
        this.genesisBlock = false;
        this.startOverTimeout = false;
    }

    sync() {
        this.network.node.log('Syncing Genesis Account...');
        
        const genesisHash = this.network.networkId;
        const genesisBlock = this.network.ledger.getBlock(genesisHash);

        if (genesisBlock) {
            this.network.node.log('Genesis block already synced.');
            this.getGenesisAccountBlocks(genesisBlock);
        } else {
            // Fetch genesis block if not already synced
            this.network.node.sendAll({
                type: 'getBlock',
                hash: genesisHash
            }, this.onGenesisBlockReceived.bind(this));
        }
    }

    onGenesisBlockReceived(response) {
        this.network.node.log('Genesis block received');

        if (!response.block || response.error){
            this.network.node.error('Invalid response for genesis block request. Peer did not deliver genesis block.', response);
            this.startOver();
            return;
        }

        if(!BlockHelper.verifySignatureWithPublicKey(response.block, response.block.signature, response.block.toAccount) ||
            BlockHelper.generateHash(response.block) != this.network.networkId) {
            this.network.node.error('Invalid genesis block hash or failed signature verification');
            this.startOver();
            return;
        }
        this.network.node.log('Genesis block verification succeeded');

        this.getGenesisAccountBlocks(response.block);
    }
    
    // Start over if no peer could provide us with a proper genesis block
    startOver(){
        this.startOverTimeout = setTimeout(()=>{
            if(!this.genesisBlock)
            {
                this.network.node.warn('No peer with genesis block. Starting over synchronization.');
                this.startOverTimeout = false;
                this.sync();
            }
        }, 30000);
    }

    // Called once we have the genesis block
    getGenesisAccountBlocks(genesisBlock) {
        this.genesisBlock = genesisBlock;
        const genesisAccount = genesisBlock.toAccount;
        this.requestAllBlocksForAccount(genesisAccount);
    }

    // Request all blocks for the genesis account
    requestAllBlocksForAccount(account) {
        this.network.node.log('Requesting all blocks for account:', account);

        this.network.node.sendAll({
            type: 'getAllBlocksForAccount',  // Request all blocks for the account
            account: account
        }, this.onAllGenesisBlocksReceived.bind(this));
    }

    async onAllGenesisBlocksReceived(response) {
        this.network.node.log('Genesis account blocks received');

        if (response.error) {
            this.network.node.error('Error receiving blocks for genesis account');
            this.syncInProgress = false; // Reset flag if there's an error
            return;
        }

        const genesisBlock = this.genesisBlock;

        let blocks = response.blocks;  // Array of blocks for the genesis account
        if (blocks) {
            // Blocks are in descending order (end to start)
            // Reverse the blocks to process them from last to first
            blocks = blocks.reverse();

            try {
                // Extract trusted peers (networkValidatorWeights)
                const peerFrontierBlock = blocks[blocks.length - 1]; // The frontier block of the genesis account
                const localFrontierBlock = this.network.ledger.getLastBlockForAccount(genesisBlock.toAccount);

                // Already synced up?
                if (localFrontierBlock && localFrontierBlock.hash === peerFrontierBlock.hash) {
                    this.network.node.log('Genesis account synced up.');

                    const trustedPeers = this.network.ledger.getAccount(genesisBlock.toAccount).networkValidatorWeights;
                    this.onGenesisSynced({ genesisBlock: genesisBlock, trustedPeers: trustedPeers });
                } else {
                    // Sync up the blocks
                    // Wait for all blocks to be processed sequentially
                    await this.network.blockManager.addBlocks(blocks);
                    if (localFrontierBlock && localFrontierBlock.hash === peerFrontierBlock.hash)
                    {
                        this.network.node.log('Genesis account synced up.');
                        const trustedPeers = this.network.ledger.getAccount(genesisBlock.toAccount).networkValidatorWeights;
                        this.onGenesisSynced({ genesisBlock: genesisBlock, trustedPeers: trustedPeers });
                    }else
                        this.network.node.log('Genesis account could not get synced up');
                }
            } catch (error) {
                this.network.node.error('Error during block sync:', error);
            }
        }
    }

}

module.exports = GenesisSyncer;
