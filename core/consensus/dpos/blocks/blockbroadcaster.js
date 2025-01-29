class BlockBroadcaster {
    constructor(network) {
        this.network = network;
    }

    // Propagate a block to peers that haven't seen it
    async broadcastBlock(block) {
        await this.network.node.broadcaster.broadcastToPeers({
            type: 'newBlock',
            block
        });
        this.network.node.info(`New block ${block.hash} broadcasted to peers`);
    }

    // Handle receiving a new block
    async handleNewBlock(block, sourceNodeId) {
        if(this.network.consensus.pendingBlockManager.pendingBlocks.has(block.hash)) {
            return;
        }

        const added = await this.network.consensus.pendingBlockManager.addBlock(block);
        if(added) {
            await this.network.consensus.proposalManager.process();
            this.broadcastBlock(block);
        }
    }
}

module.exports = BlockBroadcaster; 