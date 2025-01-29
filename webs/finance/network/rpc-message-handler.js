const BlockHelper = require('../../../core/utils/blockhelper');
const Decimal = require('decimal.js');  // Import Decimal for big number conversions
const BlockManager = require('../../../core/blockprocessors/blockmanager.js');

class RPCMessageHandler {
    constructor(network) {
        this.network = network;
        this.node = network.node;
        this.blockManager = network.blockManager;
    }

    async handleMessage(message, req, res) {
        try {
            const action = message.action;

            // Handle actions based on 'action' field in the JSON body
            switch (action) {
                case 'sendBlock':
                    this.sendBlock(res, message);
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
        if(tx.fee)
        {
            if(tx.fee.amount)
                tx.fee.amount = this.convertToDisplayUnit(tx.fee.amount);
            if(tx.fee.delegatorReward)
                tx.fee.delegatorReward = this.convertToDisplayUnit(tx.fee.delegatorReward);
            if(tx.fee.burnAmount)
                tx.fee.burnAmount = this.convertToDisplayUnit(tx.fee.burnAmount);
        }
    }

    // Handle sending an email (action = send)
    async sendBlock(res, data) {
        if(!data.block)
        {
            this.node.SendRPCResponse(res, { success: false, message: 'Block data missing' });
            return;
        }
        const parseResult = await this.blockManager.prepareBlock(data.block);
        if(parseResult.state == 'VALID')
        {
            // Propose the block to the consensus layer
            const valid_block = await this.network.consensus.proposeBlock(parseResult.block);
            if(valid_block)
                this.node.SendRPCResponse(res, { success: true, block: parseResult.block.hash });
            else
                this.node.SendRPCResponse(res, { success: false, message: 'Block not accepted for voting.' });
        }
        else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async getTransactions(res, data) {
        const { accountId } = data;
        const transactions = await this.network.ledger.getAccountHistory(accountId);
        if (transactions != null) {
            // Covert raw units to display units
            transactions.forEach((tx) => {
                tx.amount = this.convertToDisplayUnit(tx.amount);
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
        const balance = await this.network.ledger.getBalanceForAccount(accountId);
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
