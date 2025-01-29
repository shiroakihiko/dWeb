const BaseBlockValidator = require('../../../../../core/blockprocessors/base/basevalidator');
const Hasher = require('../../../../../core/utils/hasher.js');

class RegisterBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        // Set validation checks explicitly
        this.setValidationChecks(['signature']); //'fromAccount', 
        this.setFinalValidationChecks(['timestamp', 'hash']);
        
        // Add register-specific schema properties
        this.addSchemaProperties({
            type: { type: 'string', enum: ['register'] },
            domainName: { type: 'string' },
            delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', nullable: true },
            timestamp: { type: 'number' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }
        }, [
            'type', 'domainName', 'delegator', 'timestamp', 'signature'
        ]);

        this.setAdditionalProperties(false);

        this.addBasicCheck(this.basicCheck.bind(this));
        this.addFinalCheck(this.finalCheck.bind(this));
    }

    async basicCheck(block) {
        const domainCheck = await this.validateDomain(block);
        if(domainCheck.state != 'VALID') {
            return domainCheck;
        }
        return { state: 'VALID' };
    }

    async finalCheck(block) {
        return await this.basicCheck(block);
    }

    async validateDomain(block) {
        if(block.toAccount !== Hasher.hashText(block.domainName)) {
            return { state: 'INVALID_DOMAIN' };
        }
        
        const domain = await this.network.ledger.getAccount(Hasher.hashText(block.domainName));
        if(domain) {
            return { state: 'DOMAIN_TAKEN' };
        }

        const isLowerCase = block.domainName === block.domainName.toLowerCase();
        if(!isLowerCase) {
            return { state: 'DOMAIN_NOT_LOWERCASE' };
        }
        
        return { state: 'VALID' };
    }
}

module.exports = RegisterBlockValidator;
module.exports = RegisterBlockValidator;