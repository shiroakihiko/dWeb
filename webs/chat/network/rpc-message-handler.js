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
                case 'sendChatMessage':
                    this.sendChatMessage(res, message);
                    return true;
                case 'getChannelHistory':
                    this.getChannelHistory(res, message);
                    return true;
                case 'getChannel':
                    this.getChannel(res, message);
                    return true;
                case 'getChannels':
                    this.getChannelList(res, message);
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

    // Handle sending a chat message (action = sendMessage)
    sendChatMessage(res, data) {
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
    getChannelHistory(res, data) {
        const { accountId } = data;
        const history = this.network.ledger.getTransactions(accountId);
        if (history && history.length > 0) {
            const messages = [];
            // Covert raw units to display units
            history.forEach((tx) => {
                /*
                tx.amount = this.convertToDisplayUnit(tx.amount);
                tx.fee = this.convertToDisplayUnit(tx.fee);
                tx.delegatorReward = this.convertToDisplayUnit(tx.delegatorReward);
                tx.burnAmount = this.convertToDisplayUnit(tx.burnAmount);
                */
                if(tx.type == 'chatmsg')
                    messages.push(tx);
            });
            this.node.SendRPCResponse(res, { success: true, messages: messages });
        } else {
            this.node.SendRPCResponse(res, { success: true, messages: [] });
        }
    }

    // Get account details (balance, blocks)
    getChannel(res, data) {
        const { networkId, accountId } = data;
        const accountInfo = this.network.ledger.getAccount(accountId);

        if (accountInfo != null) {
            const blocks = this.network.ledger.getTransactions(accountId);
            accountInfo.balance = this.convertToDisplayUnit(accountInfo.balance);
            blocks.forEach(block => {
                block.amount = this.convertToDisplayUnit(block.amount);
                block.fee = this.convertToDisplayUnit(block.fee);
                block.delegatorReward = this.convertToDisplayUnit(block.delegatorReward);
                block.burnAmount = this.convertToDisplayUnit(block.burnAmount);
            });
            this.node.SendRPCResponse(res, { success: true, accountInfo: accountInfo, blocks: blocks });
        } else {
            this.node.SendRPCResponse(res, { success: false, message: 'Account not found' });
        }
    }

    // Channels are hidden by default (their name+secret make up a hash)
    // Returns a default list of channels people can participate in
    getChannelList(res, data) {
        const defaultChannels = [];
        defaultChannels.push({name:'main', secret:''});
        defaultChannels.push({name:'coding', secret:''});
        defaultChannels.push({name:'delegators', secret:''});
        this.node.SendRPCResponse(res, { success: true, channels: defaultChannels });
    }

}

module.exports = RPCMessageHandler;
