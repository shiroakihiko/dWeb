const ActionHelper = require('../../../core/utils/actionhelper');
const Jimp = require('jimp').Jimp;

class RPCMessageHandler {
    constructor(network) {
        this.network = network;
        this.node = network.node;
        this.actionManager = network.actionManager;
    }

    async handleMessage(message, req, res) {
        try {
            const method = message.method;

            switch (method) {
                case 'uploadThumbnail':
                    await this.uploadThumbnail(res, message);
                    return true;
                case 'getThumbnails':
                    await this.getThumbnails(res, message);
                    return true;
                case 'getThumbnail':
                    await this.getThumbnail(res, message);
                    return true;
                case 'setDefaultThumbnail':
                    await this.setDefaultThumbnail(res, message);
                    return true;
                case 'getDefaultThumbnail':
                    await this.getDefaultThumbnail(res, message);
                    return true;
            }
        } catch (err) {
            this.network.node.error(err);
            this.node.SendRPCResponse(res, { success: false, message: 'Invalid request body' });
            return true;
        }

        return false;
    }

    async uploadThumbnail(res, data) {
        if (!data.action) {
            this.node.SendRPCResponse(res, { success: false, message: 'Action data missing' });
            return;
        }

        const parseResult = await this.actionManager.prepareAction(data.action);
        if (parseResult.state == 'VALID') {
            const valid_action = this.network.consensus.proposeAction(parseResult.action);
            if (valid_action)
                this.node.SendRPCResponse(res, { success: true, action: parseResult.action.hash });
            else
                this.node.SendRPCResponse(res, { success: false, message: 'Action not accepted for voting.' });
        } else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async getThumbnails(res, data) {
        const { accountId } = data;
        const history = this.network.ledger.getAccountHistory(accountId);
        if (history && history.length > 0) {
            const thumbnails = history.filter(tx => tx.instruction.type === 'thumbnail');
            this.node.SendRPCResponse(res, { success: true, thumbnails });
        } else {
            this.node.SendRPCResponse(res, { success: true, thumbnails: [] });
        }
    }

    async getThumbnail(res, data) {
        const { contentId, width, height } = data;
        const action = this.network.ledger.getAction(contentId);

        if (!action) {
            this.node.SendRPCResponse(res, { success: false, message: 'Thumbnail not found' });
            return;
        }

        try {
            if (width || height) {
                // Resize the image if dimensions are specified
                const imageBuffer = Buffer.from(action.instruction.data, 'base64');
                const image = await Jimp.read(imageBuffer);
                
                image.scaleToFit(width || action.width, height || action.height);
                const resizedBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
                
                action.instruction.data = resizedBuffer.toString('base64');
                action.instruction.width = image.width;
                action.instruction.height = image.height;
            }

            this.node.SendRPCResponse(res, { success: true, thumbnail: action });
        } catch (error) {
            this.node.SendRPCResponse(res, { success: false, message: 'Error processing thumbnail' });
        }
    }

    async setDefaultThumbnail(res, data) {
        if (!data.action) {
            this.node.SendRPCResponse(res, { success: false, message: 'Action data missing' });
            return;
        }

        const parseResult = await this.actionManager.prepareAction(data.action);
        if (parseResult.state == 'VALID') {
            const valid_action = this.network.consensus.proposeAction(parseResult.action);
            if (valid_action)
                this.node.SendRPCResponse(res, { success: true, action: parseResult.action.hash });
            else
                this.node.SendRPCResponse(res, { success: false, message: 'Action not accepted for voting.' });
        } else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async getDefaultThumbnail(res, data) {
        const { accountId } = data;
        const account = this.network.ledger.getAccount(accountId);
        
        if (!account || !account.defaultThumbnail) {
            this.node.SendRPCResponse(res, { success: true, thumbnail: null });
            return;
        }

        const thumbnail = this.network.ledger.getAction(account.defaultThumbnail);
        if (!thumbnail) {
            this.node.SendRPCResponse(res, { success: true, thumbnail: null });
            return;
        }

        this.node.SendRPCResponse(res, { success: true, thumbnail });
    }
}

module.exports = RPCMessageHandler;
