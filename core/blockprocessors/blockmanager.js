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

    async addBlocks(blocks) {
        for (let block of blocks) {
            try {
                let result = await this.blockProcessors[block.type].ledgerAdder.addBlock(block);
                this.network.node.log(`Synchronization (${block.type}) (${block.hash}): ${result.state}`);
            } catch (error) {
                this.network.node.log(`Error processing block (${block.hash}): ${error}`);
            }
        }
    }

    async addBlock(block) {
        // Process the block depending on its type
        if(this.blockProcessors[block.type])
        {
            const result = await this.blockProcessors[block.type].ledgerAdder.addBlock(block);
            result.block = block;
            return result;
        }
        return { state: 'INVALID_BLOCK_TYPE', block: block };
    }

    // Validate general block
    validateBlock(block) {
        if(this.blockProcessors[block.type])
            return this.blockProcessors[block.type].validator.validateFinal(block);

        return { state: 'INVALID_BLOCK_TYPE' };
    }

    // Validate general block
    validBlockFinalization(block) {
        if(this.blockProcessors[block.type])
        {
            if(!this.blockProcessors[block.type].validator.validBlockFinalization)
                return { state: 'VALID' };
            else
                return this.blockProcessors[block.type].validator.validBlockFinalization(block);
        }
        return { state: 'INVALID_BLOCK_TYPE' };
    }

    // Takes an RPC request and creates a new block out the request data
    createBlock(blockData)
    {
        if(this.blockProcessors[blockData.type])
            return this.blockProcessors[blockData.type].createNewBlock(blockData);

        return { state: 'INVALID_BLOCK_TYPE' };
    }

    // Takes a signed block from the RPC call and returns it
    parseBlock(blockData)
    {
        if(this.blockProcessors[blockData.type])
            return this.blockProcessors[blockData.type].parseBlock(blockData);

        return { state: 'INVALID_BLOCK_TYPE' };
    }

    // Add custom blocks and block processors
    addProcessor(id, blockProcessor)
    {
        this.blockProcessors[id] = blockProcessor;
    }
    
    // Some blocks need a callback to complete a process (e.g. vote end, swap execution etc.)
    executeCallbacks()
    {
        if(this.network.ledger)
        {
            const callbacks = this.network.ledger.blockCallbacks.getAllCallbacks();
            for(const blockHash of callbacks)
            {
                const block = this.network.ledger.getBlock(blockHash);
                if(this.blockProcessors[block.type])
                    this.blockProcessors[block.type].callback.blockCallback(block);
            }
        }
        
        setTimeout(() => { this.executeCallbacks(); }, 5000);
    }
}

module.exports = BlockManager;
