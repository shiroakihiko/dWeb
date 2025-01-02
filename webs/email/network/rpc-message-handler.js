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

    // Handle sending an email (action = sendEmail)
    sendEmail(res, data) {
        if(!data.block)
        {
            this.node.SendRPCResponse(res, { success: false, message: 'Block data missing' });
            return;
        }

        const parseResult = this.blockManager.parseBlock(data.block);
        if(parseResult.state == 'VALID')
        {
            // Propose the block to the consensus layer
            let valid_block = this.network.consensus.proposeBlock(parseResult.block);
            if(valid_block)
                this.node.SendRPCResponse(res, { success: true, block: parseResult.block.hash });
            else
                this.node.SendRPCResponse(res, { success: false, message: 'Block not accepted for voting.' });
        }
        else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }


    // Retrieve email history for a given account
    getEmailHistory(res, data) {
        const { accountId } = data;
        const history = this.network.ledger.getTransactions(accountId);
        if (history && history.length > 0) {
            const emails = [];
            // Covert raw units to display units
            history.forEach((tx) => {
                /*
                tx.amount = this.convertToDisplayUnit(tx.amount);
                tx.fee = this.convertToDisplayUnit(tx.fee);
                tx.delegatorReward = this.convertToDisplayUnit(tx.delegatorReward);
                tx.burnAmount = this.convertToDisplayUnit(tx.burnAmount);
                */
                if(tx.type == 'email')
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
