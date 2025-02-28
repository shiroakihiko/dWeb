const Decimal = require('decimal.js');  // Import Decimal for big number conversions
const fetchPromise = import('node-fetch').then(mod => mod.default)
const fetch = (...args) => fetchPromise.then(fetch => fetch(...args))
const cheerio = require('cheerio');
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

            // Handle actions based on 'action' field in the JSON body
            switch (method) {
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
                case 'getLinkPreview':
                    await this.getLinkPreview(res, message);
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

    // Handle sending a chat message (action = sendMessage)
    async sendChatMessage(res, data) {
        if(!data.action)
        {
            this.node.SendRPCResponse(res, { success: false, message: 'Action data missing' });
            return;
        }

        const parseResult = await this.actionManager.prepareAction(data.action);
        if(parseResult.state == 'VALID')
        {
            // Propose the action to the consensus layer
            let valid_action = this.network.consensus.proposeAction(parseResult.action);
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
    async getChannelHistory(res, data) {
        const { accountId } = data;
        const history = this.network.ledger.getAccountHistory(accountId);
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
                if(tx.instruction.type == 'chatmsg')
                    messages.push(tx);
            });
            this.node.SendRPCResponse(res, { success: true, messages: messages });
        } else {
            this.node.SendRPCResponse(res, { success: true, messages: [] });
        }
    }

    // Get account details (balance, actions)
    async getChannel(res, data) {
        const { networkId, accountId } = data;
        const accountInfo = this.network.ledger.getAccount(accountId);

        if (accountInfo != null) {
            const actions = this.network.ledger.getAccountHistory(accountId);
            accountInfo.balance = this.convertToDisplayUnit(accountInfo.balance);
            actions.forEach(action => {
                action.amount = this.convertToDisplayUnit(action.amount);
                this.formatFee(action);
            });
            this.node.SendRPCResponse(res, { success: true, accountInfo: accountInfo, actions: actions });
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

    async getLinkPreview(res, data) {
        try {
            const { url } = data;
            
            // Basic URL validation
            if (!url || !url.match(/^https?:\/\/.+/)) {
                this.node.SendRPCResponse(res, { 
                    success: false, 
                    message: 'Invalid URL' 
                });
                return;
            }

            const response = await fetch(url);
            const html = await response.text();
            const $ = cheerio.load(html);

            // Extract metadata
            const metadata = {
                title: $('meta[property="og:title"]').attr('content') || $('title').text(),
                description: $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content'),
                image: $('meta[name="twitter:image"]').text() || $('meta[property="og:image"]').attr('content'),
                siteName: $('meta[property="og:site_name"]').attr('content'),
                url: url
            };

            // Trim text content
            metadata.title = metadata.title?.substring(0, 100) || '';
            metadata.description = metadata.description?.substring(0, 150) || '';
            metadata.siteName = metadata.siteName?.substring(0, 30) || '';

            // If it's a YouTube video, get additional metadata
            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                const videoId = url.includes('youtube.com') ? 
                    url.split('v=')[1]?.split('&')[0] : 
                    url.split('youtu.be/')[1];
                if (videoId) {
                    metadata.type = 'video';
                    metadata.videoId = videoId;
                    // Use smaller thumbnail
                    metadata.thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                }
            }

            // If there's an image, fetch and process it
            if (metadata.image) {
                try {
                    const imageResponse = await fetch(metadata.image);
                    const imageBuffer = await imageResponse.arrayBuffer();

                    // Process image with Jimp
                    const image = await Jimp.read(Buffer.from(imageBuffer));
                    
                    // Scale the image with w and h properties
                    await image.scaleToFit({ 
                        w: 300, 
                        h: 150 
                    });
                    
                    const processedBuffer = await image.getBuffer("image/jpeg", {
                        quality: 90 // Reduce quality
                    });
                    metadata.imageData = `data:image/jpeg;base64,${processedBuffer.toString('base64')}`;
                } catch (imageError) {
                    this.node.error('Image processing error:', imageError);
                    metadata.imageData = null;
                }
            }

            this.node.SendRPCResponse(res, { 
                success: true, 
                metadata 
            });
        } catch (error) {
            this.node.error(error);
            this.node.SendRPCResponse(res, { 
                success: false, 
                message: 'Failed to fetch link preview' 
            });
        }
    }
}

module.exports = RPCMessageHandler;
