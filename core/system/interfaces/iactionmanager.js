class IActionManager {
    // Action-level operations
    async createAction(params) { throw new Error('Not implemented'); } // params: {account, toAccount, amount, type etc}
    async validateAction(validationData) { throw new Error('Not implemented'); } // validationData: { action, block, accountManager }
    validateActionStructure(validationData) { throw new Error('Not implemented'); } // validationData: { action, block, accountManager }
    async processAction(processData) { throw new Error('Not implemented'); } // processData: { action, block, accountManager }
    async prepareAction(actionData) { throw new Error('Not implemented'); } // actionData: { account, instructions:[], etc. }
}

module.exports = IActionManager; 