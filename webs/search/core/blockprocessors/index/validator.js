const BaseBlockValidator = require('../../../../../core/blockprocessors/base/basevalidator');
const BlockHelper = require('../../../../../core/utils/blockhelper.js');
const natural = require('natural');
const tokenizer = new natural.WordTokenizer();

class IndexBlockValidator extends BaseBlockValidator {
    constructor(network) {
        super(network);
        
        // Set validation checks explicitly
        this.setValidationChecks(['signature', 'title', 'description', 'content', 'tokens']); // TODO: Add fromAccount
        this.setFinalValidationChecks(['timestamp', 'hash']);
        
        // Initialize content hash storage
        this.contentHashes = new Map();
        
        this.schemaProperties.properties.toAccount = { type: 'string', pattern: '^[0-9a-fA-F]{64}@[0-9a-fA-F]{64}$' };
        /*this.schemaProperties.properties.previousBlocks.patternProperties = {
            '^[0-9a-fA-F]{64}@[0-9a-fA-F]{64}$': { type: 'string', nullable: true },
            '^[0-9a-fA-F]{64}$': { type: 'string', nullable: true }
        };*/
        
        // Add index-specific schema properties
        this.addSchemaProperties({
            type: { type: 'string', enum: ['index'] },
            title: { type: 'string' },
            description: { type: 'string' },
            content: { type: 'string' },
            contentHash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            tokens: { 
                type: 'array',
                items: { type: 'string' }
            },
            delegator: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            timestamp: { type: 'number' },
            signature: { type: 'string', pattern: '^[A-Za-z0-9+/=]+$' }
        }, [
            'type', 'title', 'description', 'content', 'contentHash', 'tokens',
            'delegator', 'timestamp', 'signature'
        ]);

        this.setAdditionalProperties(false);

        this.addBasicCheck(this.basicCheck.bind(this));
        this.addFinalCheck(this.finalCheck.bind(this));
    }

    async basicCheck(block) {
        if (!this.validateContentStructure(block)) {
            return { state: 'INVALID_CONTENT_STRUCTURE' };
        }
        
        // Start content fetch in background
        this.startContentFetch(block.toAccount);
        
        return { state: 'VALID' };
    }

    async finalCheck(block) {
        if (!this.validateContentStructure(block)) {
            return { state: 'INVALID_CONTENT_STRUCTURE' };
        }
        return { state: 'VALID' };
    }

    validateContentStructure(block) {
        // Check title length
        if (block.title.length < 3 || block.title.length > 200) {
            return false;
        }
        // Check description length
        if (block.description.length < 10 || block.description.length > 500) {
            return false;
        }
        // Check content length
        if (block.content.length < 10 || block.content.length > 1000) {
            return false;
        }

        // Verify tokens match title and description
        const expectedTokens = tokenizer.tokenize(
            (block.title + ' ' + block.description).toLowerCase()
        ).sort();
        
        const blockTokens = [...block.tokens].sort();
        if (JSON.stringify(expectedTokens) !== JSON.stringify(blockTokens)) {
            return false;
        }

        return true;
    }

    // Network consensus that needs to be met for the block to be valid
    async validateNetworkConsensus(block) {
        const networkConsensus = await super.validateNetworkConsensus(block);
        if(networkConsensus.state != 'VALID') {
            return networkConsensus;
        }

        // Check if we have the content hash and if it matches
        const storedHash = this.contentHashes.get(block.toAccount);
        
        if (storedHash) {
            if (storedHash !== block.contentHash) {
                return { state: 'CONTENT_HASH_MISMATCH' };
            }
        }
        // If we don't have the hash yet, that's okay - other nodes will verify
        
        return { state: 'VALID' };
    }

    // Background content fetching
    startContentFetch(toAccount) {
        // Only start fetch if we don't have the hash already
        if (!this.contentHashes.has(toAccount)) {
            this.fetchContent(toAccount).catch(() => {
                // Silently fail - validation will happen on other nodes
            });
        }
    }

    async fetchContent(toAccount) {
        const [contentIdPart, targetNetworkId] = toAccount.split('@');
        const content = await this.network.node.relayToTargetNetwork(
            targetNetworkId, 
            { action: 'getFile', contentId: contentIdPart }
        );

        if (content) {
            const contentHash = BlockHelper.hashText(content);
            this.contentHashes.set(toAccount, contentHash);
        }
    }
}

module.exports = IndexBlockValidator;