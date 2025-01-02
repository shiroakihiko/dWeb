const Decimal = require('decimal.js');

class BlockFeeCalculator {
    constructor(network) {
        this.network = network;
    }

    // Fee distribution logic (to be used in validation and elsewhere)
    calculateFeeDistribution(block) {
        const feeAmount = new Decimal(block.fee);
        let burnAmount = feeAmount;
        let delegatorReward = new Decimal(0);

        // If the delegator is not the sender and receiver
        if (block.delegator !== block.fromAccount && block.toAccount !== block.delegator) {
            delegatorReward = feeAmount.mul(0.5);  // Reward the delegator with 50% of the fee
            burnAmount = feeAmount.sub(delegatorReward);  // Subtract reward from feeAmount
        }

        return {
            delegatorReward: delegatorReward.toString(),
            burnAmount: burnAmount.toString()
        };
    }
}

module.exports = BlockFeeCalculator;
