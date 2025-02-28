const BaseInstructionValidator = require('../../../../../core/system/instruction/base/baseinstructionvalidator.js');
const Hasher = require('../../../../../core/utils/hasher');
const natural = require('natural');
const tokenizer = new natural.WordTokenizer();

class IndexInstructionValidator extends BaseInstructionValidator {
    constructor(network) {
        super(network);
        
        // Initialize content hash storage
        this.contentHashes = new Map();
        
        this.addInstructionProperties({
            type: { type: 'string', enum: ['index'] },
            title: { type: 'string' },
            description: { type: 'string' },
            content: { type: 'string' },
            contentHash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
            tokens: { 
                type: 'array',
                items: { type: 'string' }
            },
            toAccount: { type: 'string', pattern: '^[0-9a-fA-F]{64}@[0-9a-fA-F]{64}$' }
        }, [
            'type',
            'title',
            'description',
            'content',
            'contentHash',
            'tokens',
            'toAccount'
        ]);
    }

    async customValidation(validationData) {
        const { instruction, action, accountManager } = validationData;

        if (!this.validateContentStructure(instruction)) {
            return { state: 'INVALID_CONTENT_STRUCTURE' };
        }
        
        // Start content fetch in background
        this.startContentFetch(instruction.toAccount);
        
        return { state: 'VALID' };
    }

    validateContentStructure(instruction) {
        // Check title length
        if (instruction.title.length < 3 || instruction.title.length > 200) {
            return false;
        }
        // Check description length
        if (instruction.description.length < 10 || instruction.description.length > 500) {
            return false;
        }
        // Check content length
        if (instruction.content.length < 10 || instruction.content.length > 1000) {
            return false;
        }

        // Verify tokens match title and description
        const expectedTokens = tokenizer.tokenize(
            (instruction.title + ' ' + instruction.description).toLowerCase()
        ).sort();
        
        const instructionTokens = [...instruction.tokens].sort();
        return JSON.stringify(expectedTokens) === JSON.stringify(instructionTokens);
    }

    // Background content fetching methods remain the same
    startContentFetch(toAccount) {
        if (!this.contentHashes.has(toAccount)) {
            this.fetchContent(toAccount).catch(() => {});
        }
    }

    async fetchContent(toAccount) {
        const [contentIdPart, targetNetworkId] = toAccount.split('@');
        const content = await this.network.node.relayToTargetNetwork(
            targetNetworkId, 
            { method: 'getFile', contentId: contentIdPart }
        );

        if (content) {
            const contentHash = await Hasher.hashText(content);
            this.contentHashes.set(toAccount, contentHash);
        }
    }
}

module.exports = IndexInstructionValidator;