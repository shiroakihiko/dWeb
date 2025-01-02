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
                case 'uploadFile':
                    this.uploadFile(res, message);
                    return true;
                case 'getFiles':
                    this.getFiles(res, message);
                    return true;
                case 'getFile':
                    this.getFile(res, message);
                    return true;
            }
        } catch (err) {
            this.network.node.error(err);
            this.node.SendRPCResponse(res, { success: false, message: 'Invalid request body' });
            return true;
        }

        return false;
    }

    // Handle sending a chat message (action = sendMessage)
    uploadFile(res, data) {
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
    getFiles(res, data) {
        const { accountId } = data;
        const history = this.network.ledger.getTransactions(accountId);
        if (history && history.length > 0) {
            const files = [];
            // Covert raw units to display units
            history.forEach((tx) => {
                /*
                tx.amount = this.convertToDisplayUnit(tx.amount);
                tx.fee = this.convertToDisplayUnit(tx.fee);
                tx.delegatorReward = this.convertToDisplayUnit(tx.delegatorReward);
                tx.burnAmount = this.convertToDisplayUnit(tx.burnAmount);
                */
                if(tx.type == 'file')
                    files.push(tx);
            });
            this.node.SendRPCResponse(res, { success: true, files: files });
        } else {
            this.node.SendRPCResponse(res, { success: true, files: [] });
        }
    }

    // Get account details (balance, blocks)
    getFile(res, data) {
        const { networkId, contentId } = data;

        // Check if contentId contains a colon (":")
        if (contentId.includes('@')) {
            // Split contentId into contentId and targetNetworkId
            const [contentIdPart, targetNetworkId] = contentId.split('@');
            
            // Set the peer message type
            data.type = 'getFile';
            data.contentId = contentIdPart; // Remove the network part from the content id

            // Call sendTargetNetwork if a targetNetworkId exists
            const relayed = this.node.relayToTargetNetwork(targetNetworkId, data, (message) => {
                // Pass on the response from the target network
                this.node.SendRPCResponse(res, { success: true, file: message.file });
            });
            if(!relayed)
                this.node.SendRPCResponse(res, { success: false, message: `Network ${targetNetworkId} could not be reached` });
                
        } else {
            // Process contentId normally (no colon)
            const block = this.network.ledger.getBlock(contentId);

            if (block != null) {
                this.node.SendRPCResponse(res, { success: true, file: block });
            } else {
                this.node.SendRPCResponse(res, { success: false, message: 'Content not found' });
            }
        }
    }

}

module.exports = RPCMessageHandler;
