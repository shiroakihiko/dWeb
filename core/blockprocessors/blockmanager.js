const SendBlockProcessor = require('./send/send.js');
const ChangeBlockProcessor = require('./change/change.js');
const NetworkBlockProcessor = require('./network/network.js');
const GenesisBlockProcessor = require('./genesis/genesis.js');

class BlockManager {
    constructor(network) {
        this.network = network;
        this.blockProcessors = {};
        this.blockProcessors['send'] = new SendBlockProcessor(network);
        this.blockProcessors['change'] = new ChangeBlockProcessor(network);
        this.blockProcessors['network'] = new NetworkBlockProcessor(network);
        this.blockProcessors['genesis'] = new GenesisBlockProcessor(network);
        
        this.executeCallbacks();
    }

    async addBlocks(blocks, containerHash) {
        for (let block of blocks) {
            try {
                let result = await this.blockProcessors[block.type].ledgerAdder.addBlock(block, containerHash);
                this.network.node.log(`Synchronization (${block.type}) (${block.hash}): ${result.state}`);
            } catch (error) {
                this.network.node.log(`Error processing block (${block.hash}): ${error}`);
            }
        }
    }

    async addBlock(block, containerHash) {
        // Process the block depending on its type
        if(this.blockProcessors[block.type])
        {
            const result = await this.blockProcessors[block.type].ledgerAdder.addBlock(block, containerHash);
            result.block = block;
            return result;
        }
        return { state: 'INVALID_BLOCK_TYPE', block: block };
    }

    // Validate general block
    async validateBlock(block) {
        if(this.blockProcessors[block.type])
            return await this.blockProcessors[block.type].validator.validateFinal(block);

        return { state: 'INVALID_BLOCK_TYPE' };
    }

    // Validate general block
    async validateNetworkConsensus(block) {
        if(this.blockProcessors[block.type])
        {
            if(!this.blockProcessors[block.type].validator.validateNetworkConsensus)
                return { state: 'VALID' };
            else
                return await this.blockProcessors[block.type].validator.validateNetworkConsensus(block);
        }
        return { state: 'INVALID_BLOCK_TYPE' };
    }

    // Takes an RPC request and creates a new block out the request data
    async createBlock(blockData)
    {
        if(this.blockProcessors[blockData.type])
            return await this.blockProcessors[blockData.type].createNewBlock(blockData);

        return { state: 'INVALID_BLOCK_TYPE' };
    }

    // Takes a signed block from the RPC call and returns it
    async prepareBlock(blockData)
    {
        if(this.blockProcessors[blockData.type])
            return await this.blockProcessors[blockData.type].prepareBlock(blockData);

        return { state: 'INVALID_BLOCK_TYPE' };
    }

    // Add custom blocks and block processors
    addProcessor(id, blockProcessor)
    {
        this.blockProcessors[id] = blockProcessor;
    }
    
    // Some blocks need a callback to complete a process (e.g. vote end, swap execution etc.)
    async executeCallbacks()
    {
        if(this.network.ledger)
        {
            const callbacks = await this.network.ledger.blockCallbacks.getAllCallbacks();
            for(const blockHash of callbacks)
            {
                const block = await this.network.ledger.getBlock(blockHash);
                if(this.blockProcessors[block.type])
                    this.blockProcessors[block.type].callback.blockCallback(block);
            }
        }
        
        setTimeout(() => { this.executeCallbacks(); }, 5000);
    }
}

module.exports = BlockManager;
