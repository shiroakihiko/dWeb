const Decimal = require('decimal.js');

class BaseFee {
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
    calculateFee(block) {
        throw new Error('calculateFee must be implemented by child class');
    }

    // Validate the fee - must be implemented by child classes
    validateFee(block) {
        throw new Error('validateFee must be implemented by child class');
    }

    // Apply the fee to the block during initialization - must be implemented by child classes
    applyFeeToBlock(block, params) {
        throw new Error('applyFeeToBlock must be implemented by child class');
    }
}

module.exports = BaseFee;
