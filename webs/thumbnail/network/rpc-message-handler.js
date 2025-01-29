const BlockHelper = require('../../../core/utils/blockhelper');
const Jimp = require('jimp').Jimp;

class RPCMessageHandler {
    constructor(network) {
        this.network = network;
        this.node = network.node;
        this.blockManager = network.blockManager;
    }

    async handleMessage(message, req, res) {
        try {
            const action = message.action;

            switch (action) {
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
        if (!data.block) {
            this.node.SendRPCResponse(res, { success: false, message: 'Block data missing' });
            return;
        }

        const parseResult = await this.blockManager.prepareBlock(data.block);
        if (parseResult.state == 'VALID') {
            const valid_block = await this.network.consensus.proposeBlock(parseResult.block);
            if (valid_block)
                this.node.SendRPCResponse(res, { success: true, block: parseResult.block.hash });
            else
                this.node.SendRPCResponse(res, { success: false, message: 'Block not accepted for voting.' });
        } else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async getThumbnails(res, data) {
        const { accountId } = data;
        const history = await this.network.ledger.getAccountHistory(accountId);
        if (history && history.length > 0) {
            const thumbnails = history.filter(tx => tx.type === 'thumbnail');
            this.node.SendRPCResponse(res, { success: true, thumbnails });
        } else {
            this.node.SendRPCResponse(res, { success: true, thumbnails: [] });
        }
    }

    async getThumbnail(res, data) {
        const { contentId, width, height } = data;
        const block = await this.network.ledger.getBlock(contentId);

        if (!block) {
            this.node.SendRPCResponse(res, { success: false, message: 'Thumbnail not found' });
            return;
        }

        try {
            if (width || height) {
                // Resize the image if dimensions are specified
                const imageBuffer = Buffer.from(block.data, 'base64');
                const image = await Jimp.read(imageBuffer);
                
                image.scaleToFit(width || block.width, height || block.height);
                const resizedBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
                
                block.data = resizedBuffer.toString('base64');
                block.width = image.width;
                block.height = image.height;
            }

            this.node.SendRPCResponse(res, { success: true, thumbnail: block });
        } catch (error) {
            this.node.SendRPCResponse(res, { success: false, message: 'Error processing thumbnail' });
        }
    }

    async setDefaultThumbnail(res, data) {
        if (!data.block) {
            this.node.SendRPCResponse(res, { success: false, message: 'Block data missing' });
            return;
        }

        const parseResult = await this.blockManager.prepareBlock(data.block);
        if (parseResult.state == 'VALID') {
            const valid_block = await this.network.consensus.proposeBlock(parseResult.block);
            if (valid_block)
                this.node.SendRPCResponse(res, { success: true, block: parseResult.block.hash });
            else
                this.node.SendRPCResponse(res, { success: false, message: 'Block not accepted for voting.' });
        } else {
            this.node.SendRPCResponse(res, { success: false, message: parseResult.state });
        }
    }

    async getDefaultThumbnail(res, data) {
        const { accountId } = data;
        const account = await this.network.ledger.getAccount(accountId);
        
        if (!account || !account.defaultThumbnail) {
            this.node.SendRPCResponse(res, { success: true, thumbnail: null });
            return;
        }

        const thumbnail = await this.network.ledger.getBlock(account.defaultThumbnail);
        if (!thumbnail) {
            this.node.SendRPCResponse(res, { success: true, thumbnail: null });
            return;
        }

        this.node.SendRPCResponse(res, { success: true, thumbnail });
    }
}

module.exports = RPCMessageHandler;
