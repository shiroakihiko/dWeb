class DeskAction {
    constructor() {
        this.action = null;
    }

    async sendAction(networkId, instruction, feeSystem) {
        // Remove action specific properties
        const processedInstruction = {...instruction};
        delete processedInstruction.delegator;
        delete processedInstruction.account;
        this.addFeeToInstruction(processedInstruction, feeSystem);

        const action = {
            lastSeenBlockHash: await this.getLastBlockHash(networkId),
            delegator: instruction.delegator,
            account: instruction.account,
            nonce: await this.getAccountNonce(networkId, instruction.account),
            instruction: processedInstruction
        };

        // Sign the block (for ledger integrity)
        await this.signAction(action);

        const sendResult = await desk.networkRequest({ networkId: networkId, method: 'sendAction', action: action });

        return sendResult;
    }

    async signAction(action) {
        const actionWithoutOverhead = this.removeOverhead(action);
        const signature = await base64Encode(await signMessage(canonicalStringify(actionWithoutOverhead)));
        action.signatures = { [action.account]: signature };
    }

    async generateActionHash(action) {
        const actionWithoutOverhead = this.removeOverhead(action);
        const canonicalData = canonicalStringify(actionWithoutOverhead);
        return await hashText(canonicalData);
    }
    
    removeOverhead(data) {
        const objectWithoutOverhead = { ...data };  // Clone the object to avoid mutation
        delete objectWithoutOverhead.hash;
        delete objectWithoutOverhead.validatorSignatures;
        delete objectWithoutOverhead.signatures;
        delete objectWithoutOverhead.timestamp;
        delete objectWithoutOverhead.blockHash;
        return objectWithoutOverhead;
    }

    addFeeToInstruction(instruction, feeSystem) {
        if (!feeSystem) {
            feeSystem = new DefaultFeeSystem();
        }
        feeSystem.addFeeToInstruction(instruction);
    }

    async getLastBlockHash(networkId) {
        const result = await desk.networkRequest({ networkId: networkId, method: 'getLastBlockHash' });
        return result.success ? result.hash : null;
    }

    async getAccountNonce(networkId, accountId) {
        const result = await desk.networkRequest({ networkId: networkId, method: 'getAccountNonce', accountId: accountId });
        return result.success ? result.nonce : 0;
    }
}

class DefaultFeeSystem {
    constructor() {
        this.feeRate = new Decimal('0.001'); // 0.1%
    }

    calculateFee(amount) {
        return new Decimal(amount).times(this.feeRate);
    }

    addFeeToInstruction(instruction) {
        const feeAmount = this.calculateFee(instruction.amount);
        const { delegatorReward, burnAmount } = this.calculateDistribution(feeAmount, instruction);

        instruction.fee = {
            amount: feeAmount.toString(),
            burnAmount: burnAmount.toString(),
            delegatorReward: delegatorReward.toString()
        };
    }

    calculateDistribution(feeAmount, instruction) {
        let burnAmount = feeAmount;
        let delegatorReward = new Decimal(0);

        // If the delegator is not sender or receiver, then the delegator gets 50% of the fee
        if (instruction.delegator !== instruction.account && instruction.toAccount !== instruction.delegator) {
            delegatorReward = feeAmount.mul(0.5);  // 50% to delegator
            burnAmount = feeAmount.sub(delegatorReward);
        }

        return {
            delegatorReward,
            burnAmount
        };
    }
}