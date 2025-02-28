const ActionHelper = require('../../../core/utils/actionhelper.js');

class RPCMessageHandler {
    constructor(network) {
        this.network = network;
        this.node = network.node;
    }

    async handleMessage(message, req, res) {
        try {
            const method = message.method;

            switch (method) {
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
            const { action } = data;
            
            // Validate the action
            if (!action.signatures || !action.account || !action.message) {
                throw new Error('Invalid call request action format');
            }

            // Verify signature
            if(!(await ActionHelper.verifySignatureWithPublicKey(action, action.signatures[action.account], action.account)))
                throw new Error('Invalid action signature');


            // Broadcast to subscribers
            this.broadcastMessageToTopic('call', {
                networkId: this.network.networkId,
                action: action
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
            const { action } = data;
            
            // Validate the action
            if (!action.signatures || !action.account || !action.toAccount || !action.message) {
                throw new Error('Invalid call accept action format');
            }

            // Verify signature
            if(!(await ActionHelper.verifySignatureWithPublicKey(action, action.signatures[action.account], action.account)))
                throw new Error('Invalid action signature');

            // Broadcast to subscribers only if the callee is on the same
            this.broadcastMessageToTopic('call', {
                networkId: this.network.networkId,
                action: action
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
            const { action } = data;
            
            // Broadcast to subscribers
            this.broadcastMessageToTopic('call', {
                networkId: this.network.networkId,
                action: action
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
            const { action } = data;
            
            // Validate the action
            if (!action.signatures || !action.account || !action.toAccount) {
                throw new Error('Invalid call end action format');
            }

            // Verify signature
            if(!(await ActionHelper.verifySignatureWithPublicKey(action, action.signatures[action.account], action.account))) {
                throw new Error('Invalid action signature');
            }

            // Broadcast end call message to all subscribers
            this.broadcastMessageToTopic('call', {
                networkId: this.network.networkId,
                action: {
                    ...action,
                    type: 'callEnded'
                }
            });

            // If channelId is provided, clean up the media channel
            if (action.channelId) {
                // The actual cleanup happens in CallMediaServer when clients unsubscribe
                this.node.verbose(`Call ended for channel: ${action.channelId}`);
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
            const { action } = data;
            
            // Validate the action
            if (!action.signatures || !action.account || !action.channelId) {
                throw new Error('Invalid keep-alive action format');
            }

            // Verify signature
            if(!(await ActionHelper.verifySignatureWithPublicKey(action, action.signatures[action.account], action.account)))
                throw new Error('Invalid action signature');

            // Broadcast keep-alive to relevant subscribers
            this.broadcastMessageToTopic('call', {
                networkId: this.network.networkId,
                action: action
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
        
        // Quickfix: Ideally we'd get the connected node that self-declare their addresses containing valid certificate for wss://?
        nodes.push({
            nodeId: '123',
            address: 'dweb1.com',
            wsPort: 8444,
            wssPort: 8445
        });
        this.node.SendRPCResponse(res, { success: true, nodes: nodes });
        return;
        // Node IP's for wss are not necessary signed by the node
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
