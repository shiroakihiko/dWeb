const BlockHelper = require('../../../core/utils/blockhelper.js');

class RPCMessageHandler {
    constructor(network) {
        this.network = network;
        this.node = network.node;
    }

    async handleMessage(message, req, res) {
        try {
            const action = message.action;

            switch (action) {
                case 'callRequest':
                    await this.handleCallRequest(res, message);
                    return true;
                case 'acceptCall':
                    await this.handleAcceptCall(res, message);
                    return true;
                case 'rejectCall':
                    await this.handleRejectCall(res, message);
                    return true;
                case 'endCall':
                    await this.handleEndCall(res, message);
                    return true;
                case 'callKeepAlive':
                    await this.handleCallKeepAlive(res, message);
                    return true;
                case 'getConnectedNodes':
                    await this.handleGetConnectedNodes(res, message);
                    return true;
            }
        } catch (err) {
            this.network.node.error(err);
            this.node.SendRPCResponse(res, { success: false, message: 'Invalid request' });
            return true;
        }

        return false;
    }

    async handleCallRequest(res, data) {
        try {
            const { block } = data;
            
            // Validate the block
            if (!block.signature || !block.fromAccount || !block.message) {
                throw new Error('Invalid call request block format');
            }

            // Verify signature
            if(!BlockHelper.verifySignatureWithPublicKey(block, block.signature, block.fromAccount))
                throw new Error('Invalid block signature');


            // Broadcast to subscribers
            this.broadcastMessageToTopic('call', {
                networkId: this.network.networkId,
                block: block
            });

            this.node.SendRPCResponse(res, { 
                success: true, 
                message: 'Call request sent' 
            });

        } catch (error) {
            this.node.SendRPCResponse(res, { 
                success: false, 
                message: error.message 
            });
        }
    }

    async broadcastMessageToTopic(topic, message) {
        const messageHash = await this.network.node.broadcaster.broadcastToPeers({
            type: 'subscriberMessage',
            topic,
            message 
        });
        this.network.node.GetSubscriptionServer().broadcastMessageToTopic(topic, message);
        this.node.info(`Subscriber message ${messageHash} broadcasted to other peers and users`);
    }

    async handleAcceptCall(res, data) {
        try {
            const { block } = data;
            
            // Validate the block
            if (!block.signature || !block.fromAccount || !block.toAccount || !block.message) {
                throw new Error('Invalid call accept block format');
            }

            // Verify signature
            if(!BlockHelper.verifySignatureWithPublicKey(block, block.signature, block.fromAccount))
                throw new Error('Invalid block signature');

            // Broadcast to subscribers only if the callee is on the same
            this.broadcastMessageToTopic('call', {
                networkId: this.network.networkId,
                block: block
            });

            this.node.SendRPCResponse(res, { 
                success: true, 
                message: 'Call accepted' 
            });

        } catch (error) {
            this.node.SendRPCResponse(res, { 
                success: false, 
                message: error.message 
            });
        }
    }

    async handleRejectCall(res, data) {
        try {
            const { block } = data;
            
            // Broadcast to subscribers
            this.broadcastMessageToTopic('call', {
                networkId: this.network.networkId,
                block: block
            });

            this.node.SendRPCResponse(res, { 
                success: true, 
                message: 'Call rejected' 
            });

        } catch (error) {
            this.node.SendRPCResponse(res, { 
                success: false, 
                message: error.message 
            });
        }
    }

    async handleEndCall(res, data) {
        try {
            const { block } = data;
            
            // Validate the block
            if (!block.signature || !block.fromAccount || !block.toAccount) {
                throw new Error('Invalid call end block format');
            }

            // Verify signature
            if(!BlockHelper.verifySignatureWithPublicKey(block, block.signature, block.fromAccount)) {
                throw new Error('Invalid block signature');
            }

            // Broadcast end call message to all subscribers
            this.broadcastMessageToTopic('call', {
                networkId: this.network.networkId,
                block: {
                    ...block,
                    type: 'callEnded'
                }
            });

            // If channelId is provided, clean up the media channel
            if (block.channelId) {
                // The actual cleanup happens in CallMediaServer when clients unsubscribe
                this.node.verbose(`Call ended for channel: ${block.channelId}`);
            }

            this.node.SendRPCResponse(res, { 
                success: true, 
                message: 'Call ended successfully' 
            });

        } catch (error) {
            this.node.SendRPCResponse(res, { 
                success: false, 
                message: error.message 
            });
        }
    }

    async handleCallKeepAlive(res, data) {
        try {
            const { block } = data;
            
            // Validate the block
            if (!block.signature || !block.fromAccount || !block.channelId) {
                throw new Error('Invalid keep-alive block format');
            }

            // Verify signature
            if(!BlockHelper.verifySignatureWithPublicKey(block, block.signature, block.fromAccount))
                throw new Error('Invalid block signature');

            // Broadcast keep-alive to relevant subscribers
            this.broadcastMessageToTopic('call', {
                networkId: this.network.networkId,
                block: block
            });

            this.node.SendRPCResponse(res, { 
                success: true
            });

        } catch (error) {
            this.node.SendRPCResponse(res, { 
                success: false, 
                message: error.message 
            });
        }
    }

    // Get available networks
    async handleGetConnectedNodes(res, data) {
        const nodes = [];
        
        for(const [nodeId, socket] of this.network.node.peers.peerManager.connectedNodes) {
            if (socket._socket) {
                let address = socket._socket.remoteAddress;
                const port = socket._socket.remotePort;
                
                // Clean up IPv6-mapped IPv4 addresses
                if (address && address.startsWith('::ffff:')) {
                    address = address.substring(7);
                }
                
                this.node.verbose(`Peer connection details - Address: ${address}, Port: ${port}`);
                
                if (address) {
                    nodes.push({
                        nodeId: nodeId,
                        address: address,  // Clean IP/hostname
                        wsPort: 8444,      // The ports we want to use for media
                        wssPort: 8445
                    });
                }
            }
        }

        this.node.SendRPCResponse(res, { success: true, nodes: nodes });
    }
}

module.exports = RPCMessageHandler;
