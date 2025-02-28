const IFee = require('../../interfaces/ifee.js');
const Decimal = require('decimal.js');

class PercentageFee extends IFee {
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

    calculateFee(instruction) {
        const amount = new Decimal(instruction.amount);
        const feeAmount = amount.mul(this.percentage).div(100);
        
        let delegatorReward = new Decimal(0);
        let burnAmount = feeAmount;
        if (instruction.delegator !== instruction.account && instruction.toAccount !== instruction.delegator) {
            delegatorReward = feeAmount.mul(0.5);
            burnAmount = feeAmount.sub(delegatorReward);
        }

        return {
            amount: feeAmount.toString(),
            delegatorReward: delegatorReward.toString(),
            burnAmount: burnAmount.toString()
        };
    }

    validateFee(instruction) {
        const calculatedFee = this.calculateFee(instruction);
        return instruction.fee.amount === calculatedFee.amount && 
               instruction.fee.delegatorReward === calculatedFee.delegatorReward && 
               instruction.fee.burnAmount === calculatedFee.burnAmount
    }

    applyFeeToInstruction(instruction) {
        const feeDistribution = this.calculateFee(instruction);
        
        instruction.fee = {
            amount: feeDistribution.amount,
            delegatorReward: feeDistribution.delegatorReward,
            burnAmount: feeDistribution.burnAmount
        };
        
        return instruction;
    }
}

module.exports = PercentageFee; 