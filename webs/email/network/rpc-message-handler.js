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
                case 'sendEmail':
                    this.sendEmail(res, message);
                    return true;
                case 'getEmailHistory':
                    this.getEmailHistory(res, message);
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


    // Handle sending an email (action = sendEmail)
    async sendEmail(res, data) {
        if(!data.block)
        {
            this.node.SendRPCResponse(res, { success: false, message: 'Block data missing' });
            return;
        }

        const parseResult = await this.actionManager.prepareAction(data.action);
        if(parseResult.state == 'VALID')
        {
            // Propose the block to the consensus layer
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


    // Retrieve email history for a given account
    async getEmailHistory(res, data) {
        const { accountId } = data;
        const history = this.network.ledger.getAccountHistory(accountId);
        if (history && history.length > 0) {
            const emails = [];
            // Covert raw units to display units
            history.forEach((tx) => {
                this.formatFee(tx);
                if(tx.instruction.type == 'email')
                    emails.push(tx);
            });
            this.node.SendRPCResponse(res, { success: true, emails: emails });
        } else {
            this.node.SendRPCResponse(res, { success: true, emails: [] });
            //this.node.SendRPCResponse(res, { success: false, message: 'No transaction history found' });
        }
    }

}

module.exports = RPCMessageHandler;
