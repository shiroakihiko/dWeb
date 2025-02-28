const BaseInstructionValidator = require('../../base/baseinstructionvalidator.js');

class GenesisInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        // Add genesis-specific schema properties
        this.addInstructionProperties({
            type: { type: 'string', enum: ['genesis'] },
            randomHash: { type: 'string' }
        }, [
            'type', 'randomHash'
        ]);
    }

    async validateInstruction(validationData) {
        const { instruction, action, accountManager } = validationData;

        if(!this.validNewGenesis()) {
            return { state: 'GENESIS_EXISTS' };
        }
        return { state: 'VALID' };
    }

    validNewGenesis() {
        return (this.network.ledger.getTotalActionCount()) === 0 && (this.network.ledger.getTotalAccountCount()) === 0;
    }
}

module.exports = GenesisInstructionValidator;
