const BaseFee = require('../base/basefee.js');
const Decimal = require('decimal.js');

class PercentageFee extends BaseFee {
    constructor(network, percentage = 0.1) { // 0.1% default fee
        super(network);
        this.percentage = percentage;
    }

    getSchemaProperties() {
        return {
            properties: {
                fee: {
                    type: 'object',
                    properties: {
                        amount: { type: 'string' },
                        delegatorReward: { type: 'string' },
                        burnAmount: { type: 'string' }
                    },
                    required: ['amount', 'delegatorReward', 'burnAmount']
                }
            },
            required: ['fee']
        };
    }

    calculateFee(block) {
        const amount = new Decimal(block.amount);
        const feeAmount = amount.mul(this.percentage).div(100);
        const delegatorReward = feeAmount.mul(0.5);
        const burnAmount = feeAmount.sub(delegatorReward);

        return {
            amount: feeAmount.toString(),
            delegatorReward: delegatorReward.toString(),
            burnAmount: burnAmount.toString()
        };
    }

    validateFee(block) {
        const calculatedFee = this.calculateFee(block);
        return new Decimal(block.fee.amount).eq(calculatedFee.amount) && 
               new Decimal(block.fee.delegatorReward).eq(calculatedFee.delegatorReward) && 
               new Decimal(block.fee.burnAmount).eq(calculatedFee.burnAmount)
    }

    applyFeeToBlock(block, params) {
        const feeDistribution = this.calculateFee(block);
        
        block.fee = {
            amount: feeDistribution.amount,
            delegatorReward: feeDistribution.delegatorReward,
            burnAmount: feeDistribution.burnAmount
        };
        
        return block;
    }
}

module.exports = PercentageFee; 