class IFee {
    constructor(network) {
        this.network = network;
    }

    // Get additional schema properties required by this fee implementation
    getSchemaProperties() {
        return {
            required: ['fee']
        };
    }

    // Calculate fee - must be implemented by child classes
    calculateFee(action) {
        throw new Error('calculateFee must be implemented by child class');
    }

    // Validate the fee - must be implemented by child classes
    validateFee(action) {
        throw new Error('validateFee must be implemented by child class');
    }

    // Apply the fee to the action during initialization - must be implemented by child classes
    applyFeeToAction(action, params) {
        throw new Error('applyFeeToAction must be implemented by child class');
    }
}

module.exports = IFee;
