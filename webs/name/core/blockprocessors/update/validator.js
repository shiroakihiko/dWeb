const BaseBlockValidator = require('../../../../../core/blockprocessors/base/basevalidator');
const Hasher = require('../../../../../core/utils/hasher.js');

class UpdateBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        // Set validation checks explicitly
        this.setValidationChecks(['fromAccount', 'signature']);
        this.setFinalValidationChecks(['timestamp', 'hash']);
        
        // Add update-specific schema properties
        this.addSchemaProperties({
            type: { type: 'string', enum: ['update'] },
            domainName: { type: 'string' },
            delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', nullable: true },
            timestamp: { type: 'number' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' },
            entries: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        protocol: { type: 'string' },
                        networkId: { type: 'string' },
                        nodeId: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                        contentId: { type: 'string', nullable: true }
                    },
                    required: ['protocol', 'networkId', 'nodeId'],
                    additionalProperties: false
                }
            }
        }, [
            'type', 'domainName', 'delegator', 'timestamp', 'signature', 'entries'
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
        if(!domain) {
            return { state: 'DOMAIN_NOT_FOUND' };
        }
        if(domain.owner !== block.fromAccount) {
            return { state: 'DOMAIN_NOT_OWNED' };
        }
        
        return { state: 'VALID' };
    }
}

module.exports = UpdateBlockValidator;