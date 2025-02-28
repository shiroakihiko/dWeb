const GenesisInstructionDefault = require('../../../../../core/system/instruction/types/genesis/genesis.js');
const GenesisInstructionProcessor = require('./processor.js');

class GenesisInstruction extends GenesisInstructionDefault {
    constructor(network) {
        super(network);

        // Override the processor for governance to add initial voting power and total rewards
        this.processor = new GenesisInstructionProcessor(network);
    }
}

module.exports = GenesisInstruction;