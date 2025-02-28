const SharedValidator = require('../shared/sharedvalidator');
const AccountUpdateManager = require('../../ledger/account/accountupdatemanager');

class ActionValidator {
    constructor(network) {
        this.network = network;
        this.sharedValidator = new SharedValidator(network);
        this.actionChecks = ['signatures']; //Todo: add back, 'account'    // Action-structure checks (signatures)
        this.finalActionChecks = ['timestamp', 'hash']; // Parsed action checks (timestamp, hash)
        
        // Base action schema (only action-level properties)
        this.actionSchema = {
            type: 'object',
            properties: {
                lastSeenBlockHash: { type: 'string', pattern: '^[0-9a-fA-F]{64}$', nullable: true },
                account: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' },
                nonce: { type: 'number' },
                instruction: { type: 'object' },
                signatures: { type: 'object' }
            },
            required: ['lastSeenBlockHash', 'account', 'nonce', 'instruction', 'signatures'],
            additionalProperties: true
        };
    }

    async validateAction(action, accountManager = null) {
        // 1. Action schema and validation checks
        const actionValidation = await this.sharedValidator.validateAction(
            action, 
            this.finalActionChecks,
            this.actionSchema
        );
        if (actionValidation.state !== 'VALID') {
            return actionValidation;
        }

        // 2. Validate instruction
        const processor = this.network.actionManager.getInstructionProcessor(action.instruction.type);
        if (!processor) {
            return { state: 'INVALID_INSTRUCTION_TYPE' };
        }

        if(!accountManager) {
            accountManager = new AccountUpdateManager(this.network.ledger);
            accountManager.setDryRun(true);
        }

        const result = await processor.validateInstruction({instruction: action.instruction, action, accountManager: accountManager});
        if (result.state !== 'VALID') {
            return result;
        }

        // Check if all updates would be valid
        const wouldBeValid = accountManager.applyValidation();
        if (!wouldBeValid) {
            this.network.node.warn(`Action ${action.hash} would result in invalid account state`);
            return { state: 'INVALID_ACCOUNT_STATE' };
        }
            
        return { state: 'VALID' };
    }

    async validateActionStructure(action) {
        const actionValidation = await this.sharedValidator.validateAction(
            action, 
            this.actionChecks,
            this.actionSchema
        );
        if (actionValidation.state !== 'VALID') {
            return actionValidation;
        }

        return { state: 'VALID' };
    }
}

module.exports = ActionValidator;