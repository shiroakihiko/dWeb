const Decimal = require('decimal.js');  // Import Decimal for big number conversions

class RPCMessageHandler {
    constructor(network) {
        this.network = network;
        this.node = network.node;
        this.actionManager = network.actionManager;
    }

    async handleMessage(message, req, res) {
        try {
            const method = message.method;

            // Handle actions based on 'action' field in the JSON body
            switch (method) {
                case 'sendAction':
                    this.sendAction(res, message);
                    return true;
                case 'getBalance':
                    this.getBalance(res, message);
                    return true;
                case 'getTransactions':
                    this.getTransactions(res, message);
                    return true;
            }
        } catch (err) {
            this.network.node.error(err);
            this.node.SendRPCResponse(res, { success: false, message: 'Invalid request body' });
            return true;
        }

        return false;
    }

    convertToDisplayUnit(input)
    {
        return new Decimal(input).dividedBy(new Decimal('100000000')).toFixed(8, Decimal.ROUND_HALF_DOWN);
    }
    convertToRawUnit(input)
    {
        return new Decimal(input).times(new Decimal('100000000')).toFixed(0, Decimal.ROUND_HALF_DOWN);
    }
    formatFee(tx)
    {
        if(tx.instruction.fee)
        {
            if(tx.instruction.fee.amount)
                tx.instruction.fee.amount = this.convertToDisplayUnit(tx.instruction.fee.amount);
            if(tx.instruction.fee.delegatorReward)
                tx.instruction.fee.delegatorReward = this.convertToDisplayUnit(tx.instruction.fee.delegatorReward);
            if(tx.instruction.fee.burnAmount)
                tx.instruction.fee.burnAmount = this.convertToDisplayUnit(tx.instruction.fee.burnAmount);
        }
    }

    // Handle sending an action (action = sendAction)
    async sendAction(res, data) {
        if(!data.action)
        {
            this.node.SendRPCResponse(res, { success: false, message: 'Action data missing' });
            return;
        }
        const parseResult = await this.actionManager.prepareAction(data.action);
        if(parseResult.state == 'VALID')
        {
            // Propose the action to the consensus layer
            const valid_action = this.network.consensus.proposeAction(parseResult.action);
            if(valid_action)
                this.node.SendRPCResponse(res, { success: true, action: parseResult.action.hash });
            else
                this.node.SendRPCResponse(res, { success: false, message: 'Action not accepted for voting.' });
        }
        else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async getTransactions(res, data) {
        const { accountId } = data;
        const transactions = this.network.ledger.getAccountHistory(accountId);
        if (transactions != null) {
            // Covert raw units to display units
            transactions.forEach((tx) => {
                tx.amount = this.convertToDisplayUnit(tx.instruction.amount);
                this.formatFee(tx);
            });
            this.node.SendRPCResponse(res, { success: true, transactions });
        } else {
            this.node.SendRPCResponse(res, { success: false, message: 'Account not found' });
        }
    }

    // Get the account balance (action = account_balance)
    async getBalance(res, data) {
        const { accountId } = data;
        let balance = this.network.ledger.getBalanceForAccount(accountId);
        if (balance != null) {
            // Convert internal raw unit to display unit
            balance = this.convertToDisplayUnit(accountInfo.balance);

            this.node.SendRPCResponse(res, { success: true, balance });
        } else {
            this.node.SendRPCResponse(res, { success: false, message: 'Account not found' });
        }
    }
}

module.exports = RPCMessageHandler;
