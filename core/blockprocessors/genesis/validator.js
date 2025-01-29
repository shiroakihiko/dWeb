const BaseBlockValidator = require('../base/basevalidator');

class GenesisBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        // Set validation checks explicitly
        this.setValidationChecks(['hash', 'signature']);
        this.setFinalValidationChecks([]);
        
        // Add genesis-specific schema properties
        this.addSchemaProperties({
            type: { type: 'string', enum: ['genesis'] },
            delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            data: { type: 'string', nullable: true },
            timestamp: { type: 'number' },
            randomHash: { type: 'string' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }
        }, [
            'type', 'delegator', 'timestamp', 'randomHash', 'signature'
        ]);

        this.setAdditionalProperties(false);

        // Bind methods and add checks
        this.addBasicCheck(this.basicCheck.bind(this));
        this.addFinalCheck(this.finalCheck.bind(this));
    }

    async basicCheck(block) {
        if(!(await this.validNewGenesis())) {
            return { state: 'GENESIS_EXISTS' };
        }
        return { state: 'VALID' };
    }

    async finalCheck(block) {
        return await this.basicCheck(block);
    }

    async validNewGenesis() {
        return (await this.network.ledger.getTotalBlockCount()) === 0 && (await this.network.ledger.getTotalAccountCount()) === 0;
    }
}

module.exports = GenesisBlockValidator;
