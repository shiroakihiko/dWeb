class InstructionRegistry {
    constructor() {
        this.processors = new Map();
    }

    register(type, processor) {
        if (!this.validateProcessor(processor)) {
            throw new Error(`Invalid processor for type: ${type}`);
        }
        this.processors.set(type, processor);
    }

    getProcessor(type) {
        const processor = this.processors.get(type);
        return processor;
    }

    validateProcessor(processor) {
        // Ensure processor implements required methods
        return typeof processor.processInstruction === 'function' &&
               typeof processor.validateInstruction === 'function' &&
               typeof processor.createInstruction === 'function';
    }

    hasProcessor(type) {
        return this.processors.has(type);
    }
}

module.exports = InstructionRegistry;