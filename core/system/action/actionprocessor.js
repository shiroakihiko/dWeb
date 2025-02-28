class ActionProcessor {
    constructor(network) {
        this.network = network;
    }

    async processAction(processData) {
        const { action, blockHash, accountManager } = processData;

        if(accountManager.isDryRun())
            return await this.processActionDryRun(processData);

        if(!blockHash)
            return { state: 'INVALID_BLOCK_HASH' };

        try {
            //return await this.network.ledger.actions.transaction(async () => {
                // Process each instruction
                const processor = this.network.actionManager.getInstructionProcessor(action.instruction.type);
                if (!processor) {
                    return { state: 'INVALID_INSTRUCTION_TYPE' };
                }

                // Validate instruction
                const validateResult = await processor.validateInstruction({instruction: action.instruction, action: action, accountManager: accountManager});
                if (validateResult.state != 'VALID')
                    return validateResult;

                // Process instruction
                await processor.processInstruction({instruction: action.instruction, action: action, accountManager: accountManager});
                
                // Update stats
                this.updateStats(action);

                // Post-processing
                this.postProcess(action);

                return { state: 'ACTION_ADDED', action: action };
            //});
        } catch (error) {
            if (this.network.node) {
                this.network.node.error('Error adding action', error);
            }
            return { state: 'PROCESS_FAILURE', error: error };
        }
    }

    async processActionDryRun(processData) {
        const { action, blockHash, accountManager } = processData;

        try {
            // Process each instruction
            const processor = this.network.actionManager.getInstructionProcessor(action.instruction.type);
            if (!processor) {
                return { state: 'INVALID_INSTRUCTION_TYPE' };
            }

            // Validate instruction
            const validateResult = await processor.validateInstruction({instruction: action.instruction, action: action, accountManager: accountManager});
            if (validateResult.state != 'VALID')
                return validateResult;

            // Process instruction
            await processor.processInstruction({instruction: action.instruction, action: action, accountManager: accountManager});
        } catch (error) {
            if (this.network.node) {
                this.network.node.error('Error adding action', error);
            }
            return { state: 'PROCESS_FAILURE', error: error };
        }

        return { state: 'ACTION_ADDED' };
    }

    // Default stats update - can be overridden by child classes
    updateStats(action) {

        return true;
    }

    // Optional post-processing hook - can be overridden by child classes
    postProcess(action) {
        // Default implementation does nothing
    }
}

module.exports = ActionProcessor; 