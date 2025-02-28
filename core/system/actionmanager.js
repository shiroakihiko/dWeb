const IActionManager = require('./interfaces/iactionmanager.js');
const ActionCreator = require('./action/actioncreator.js');
const ActionValidator = require('./action/actionvalidator.js');
const ActionProcessor = require('./action/actionprocessor.js');
const InstructionRegistry = require('./instruction/registry/instructionregistry.js');
const SendInstruction = require('./instruction/types/send/send.js');
const DelegatorInstruction = require('./instruction/types/delegator/delegator.js');
const NetworkInstruction = require('./instruction/types/network/network.js');
const NetworkUpdateInstruction = require('./instruction/types/networkupdate/network.js');
const GenesisInstruction = require('./instruction/types/genesis/genesis.js');

class ActionManager extends IActionManager {
    constructor(network) {
        super(network);

        this.network = network;
        this.instructionRegistry = new InstructionRegistry();
        
        // Separate processors for different concerns
        this.actionCreator = new ActionCreator(network);
        this.actionValidator = new ActionValidator(network);
        this.actionProcessor = new ActionProcessor(network);

        // Initialize default instruction processors
        this.instructionRegistry.register('send', new SendInstruction(network));
        this.instructionRegistry.register('delegator', new DelegatorInstruction(network));
        this.instructionRegistry.register('network', new NetworkInstruction(network));
        this.instructionRegistry.register('networkUpdate', new NetworkUpdateInstruction(network));
        this.instructionRegistry.register('genesis', new GenesisInstruction(network));
        
        this.executeCallbacks();
    }

    Stop() {
        clearTimeout(this.timerExecuteCallbacks);
    }

    async processAction(processData) {
        return await this.actionProcessor.processAction(processData);
    }

    // Validate general action
    async validateAction(action, accountManager = null) {
        return await this.actionValidator.validateAction(action, accountManager);
    }

    // Validate action structure
    validateActionStructure(action) {
        return this.actionValidator.validateActionStructure(action);
    }

    // Takes an RPC request and creates a new action out the request data
    async createAction(actionData) {
        return await this.actionCreator.createAction(actionData);
    }

    // Takes a validator unsigned/unhashed action, signs and adds an hash to it
    async prepareAction(actionData) {
        return await this.actionCreator.prepareAction(actionData);
    }
    
    // Some actions need a callback to complete a process (e.g. vote end, swap execution etc.)
    async executeCallbacks()
    {
        if(this.network.ledger)
        {
            const actionCallbacks = this.network.ledger.actionCallbacks.getAllCallbacks();
            for(const action of actionCallbacks)
            {
                if(this.instructionRegistry.getProcessor(action.instruction.type))
                    this.instructionRegistry.getProcessor(action.instruction.type).instructionCallback({action, instruction: action.instruction});
            }
        }
        
        this.timerExecuteCallbacks = setTimeout(() => { this.executeCallbacks(); }, 5000);
    }

    // Instruction registry operations
    registerInstructionType(type, instructionProcessor) {
        this.instructionRegistry.register(type, instructionProcessor);
    }

    getInstructionProcessor(type) {
        return this.instructionRegistry.getProcessor(type);
    }
}

module.exports = ActionManager;
