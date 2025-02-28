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
    async uploadFile(res, data) {
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

    // Retrieve email history for a given account
    async getFiles(res, data) {
        const { accountId } = data;
        const history = this.network.ledger.getAccountHistory(accountId);
        if (history && history.length > 0) {
            const files = [];
            // Covert raw units to display units
            history.forEach((tx) => {
                this.formatFee(tx);
                if(tx.instruction.type == 'file')
                    files.push(tx);
            });
            this.node.SendRPCResponse(res, { success: true, files: files });
        } else {
            this.node.SendRPCResponse(res, { success: true, files: [] });
        }
    }

    // Get account details (balance, actions)
    async getFile(res, data) {
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
            const action = this.network.ledger.getAction(contentId);

            if (action != null) {
                this.node.SendRPCResponse(res, { success: true, file: action });
            } else {
                this.node.SendRPCResponse(res, { success: false, message: 'Content not found' });
            }
        }
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
}

module.exports = RPCMessageHandler;
