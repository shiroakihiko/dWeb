const BlockHelper = require('../../../core/utils/blockhelper');
const Decimal = require('decimal.js');  // Import Decimal for big number conversions
const BlockManager = require('../../../core/blockprocessors/blockmanager.js');

class RPCMessageHandler {
    constructor(network) {
        this.network = network;
        this.blockManager = network.blockManager;
    }

    async handleMessage(message, req, res) {
        try {
            const action = message.action;

            // Handle actions based on 'action' field in the JSON body
            switch (action) {
                case 'createPost':
                    this.createPost(res, message);
                    return true;
                case 'getPosts':
                    this.getPosts(res, message);
                    return true;
            }
        } catch (err) {
            this.network.node.error(err);
            this.network.node.SendRPCResponse(res, { success: false, message: 'Invalid request body' });
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

    // Create a social post
    async createPost(res, data) {
        if(!data.block)
        {
            this.network.node.SendRPCResponse(res, { success: false, message: 'Block data missing' });
            return;
        }

        const parseResult = await this.blockManager.prepareBlock(data.block);
        if(parseResult.state == 'VALID')
        {
            // Propose the block to the consensus layer
            const valid_block = await this.network.consensus.proposeBlock(parseResult.block);
            if(valid_block)
                this.network.node.SendRPCResponse(res, { success: true, block: parseResult.block.hash });
            else
                this.network.node.SendRPCResponse(res, { success: false, message: 'Block not accepted for voting.' });
        }
        else {
            this.network.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }


    // Retrieve posts for a given account
    async getPosts(res, data) {
        const { accountId } = data;
        const history = await this.network.ledger.getAccountHistory(accountId);
        if (history && history.length > 0) {
            const posts = [];
            // Covert raw units to display units
            history.forEach((tx) => {
                this.formatFee(tx);
                if(tx.type == 'post')
                    posts.push(tx);
            });
            this.network.node.SendRPCResponse(res, { success: true, posts: posts });
        } else {
            this.network.node.SendRPCResponse(res, { success: true, posts: [] });
            //this.network.node.SendRPCResponse(res, { success: false, message: 'No transaction history found' });
        }
    }

}

module.exports = RPCMessageHandler;
