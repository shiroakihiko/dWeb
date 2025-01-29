const WebSocket = require('ws');
const Signer = require('../../utils/signer');
const PeerManager = require('./peermanager');

class Peers {
    constructor(dnet, config) {
        this.dnet = dnet;
        this.peerManager = new PeerManager();
        this.messageHandlers = [];
        this.callbacks = new Map();
        this.port = config.peerPort;
        this.started = false;
        this.callbackTimeouts = new Map(); // Add timeout tracking
        this.defaultTimeout = 30000; // 30 seconds default timeout
    }

    Start() {
        if(this.started)
            return;

        this.ws = null;
        this.attemptToBindWebSocketServer();
        this.checkProcess();
        this.started = true;
    }

    addPeers(networkId, peers) {
        this.peerManager.addPeers(networkId, peers);
    }

    AddMessageHandler(messageHandler) {
        this.messageHandlers.push(messageHandler);
    }

    RemoveMessageHandler(messageHandler) {
        const index = this.messageHandlers.indexOf(messageHandler);
        this.messageHandlers.splice(index, 1);
    }

    sendMessage(socket, message, callback = null, timeout = this.defaultTimeout) {
        if (callback != null) {
            this.callbacks.set(message.id, callback);
            
            const timeoutId = setTimeout(() => {
                if (this.callbacks.has(message.id)) {
                    this.callbacks.get(message.id)({ 
                        error: 'Timeout waiting for response',
                        timedOut: true 
                    });
                    this.callbacks.delete(message.id);
                    this.callbackTimeouts.delete(message.id);
                }
            }, timeout);
            
            this.callbackTimeouts.set(message.id, timeoutId);
        }

        const rawMessage = JSON.stringify(message);
        const rawSize = Buffer.from(rawMessage).length;
        
        // Updated compression check
        const isCompressed = socket.extensions && 
                           socket.extensions.includes('permessage-deflate');
        
        // Get size before sending
        const wireSize = socket.readyState === WebSocket.OPEN ? 
                        socket._socket.bytesWritten : 'unknown';
        
        socket.send(rawMessage, (error) => {
            if (error) {
                this.dnet.logger.error(`Failed to send message: ${error}`, null, 'Peers');
                return;
            }
            
            // Calculate the difference in bytes written to get actual size
            const newWireSize = socket.readyState === WebSocket.OPEN ? 
                               socket._socket.bytesWritten : 'unknown';
            const messageSizeOnWire = wireSize !== 'unknown' && newWireSize !== 'unknown' ? 
                                    newWireSize - wireSize : 'unknown';
            
            /*this.dnet.logger.debug(
                `Message sent - Raw size: ${rawSize} bytes, ` +
                `Compression: ${isCompressed ? 'enabled' : 'disabled'}, ` +
                `Wire size: ${messageSizeOnWire}`, 
                'Peers'
            );*/
        });
    }

    sendAll(message) {
        this.peerManager.getConnectedPeers().forEach(peer => {
            this.sendMessage(peer, message);
        });
    }

    attemptToBindWebSocketServer() {
        try {
            this.ws = new WebSocket.Server({ 
                port: this.port, 
                perMessageDeflate: true
            });
            this.ws.on('connection', (socket, req) => {
                this.dnet.logger.info(`New connection established (Server-side): ${req.socket.remoteAddress}`, 'Peers');
                this.handleNewConnection(socket, req);
            });

            this.ws.on('error', (err) => {
                this.dnet.logger.error('WebSocket server binding failed:', err.code, 'Peers');
                this.ws = null;
            });
        } catch (error) {
            this.dnet.logger.error(`WebSocket server binding failed: ${error}`, null, 'Peers');
            this.ws = null;
        }
    }

    handleNewConnection(socket, req) {
        // Log compression status when connection is established
        const compressionEnabled = socket.extensions && 
                                 socket.extensions.includes('permessage-deflate');
        this.dnet.logger.info(
            `New connection established - Compression: ${compressionEnabled ? 'enabled' : 'disabled'}`,
            'Peers'
        );

        this.peerManager.addConnection(socket, req.socket.remoteAddress);

        socket.on('message', (signedMessage) => {
            const data = JSON.parse(signedMessage);
            if (!this.verifyMessage(data, socket)) {
                this.dnet.logger.error('Invalid message signature, closing connection...', null, 'Peers');
                socket.close();
                return;
            }

            const message = JSON.parse(data.message);
            this.peerManager.setNodeConnection(message.nodeId, socket);

            this.messageHandlers.forEach(handler => {
                handler.ReceivedPeerMessage(message, socket);
            });

            if(message.reply_id && this.callbacks.has(message.reply_id)) {
                // Clear timeout when response is received
                if (this.callbackTimeouts.has(message.reply_id)) {
                    clearTimeout(this.callbackTimeouts.get(message.reply_id));
                    this.callbackTimeouts.delete(message.reply_id);
                }
                
                this.callbacks.get(message.reply_id)(message);
                this.callbacks.delete(message.reply_id);
            }
        });

        socket.on('close', () => {
            const removedNodeId = this.peerManager.removeConnection(socket, req.socket.remoteAddress);
            if (removedNodeId) {
                this.dnet.logger.info(`Node ${removedNodeId} disconnected`, 'Peers');
            }
        });
    }

    verifyMessage(messageData, socket) {
        const { message, signature } = messageData;
        if(!message || !signature)
            return false;
        
        const publicKey = JSON.parse(message).nodeId;
        return Signer.verifySignatureWithPublicKey(message, signature, publicKey);
    }

    attemptPeerConnections() {
        const availablePeer = this.peerManager.getNextAvailablePeer();
        if(!availablePeer)
            return;
        
        this.connectToPeer(availablePeer);
    }

    connectToPeer(peerAddress) {
        const newPeerSocket = new WebSocket(`ws://${peerAddress}`, { perMessageDeflate: true });
        
        newPeerSocket.on('open', () => {
            this.dnet.logger.info(`Connected to new peer: ${peerAddress}`, 'Peers');
            this.peerManager.addConnection(newPeerSocket, peerAddress);
        });

        newPeerSocket.on('message', (signedMessage) => {
            const data = JSON.parse(signedMessage);
            if (!this.verifyMessage(data, newPeerSocket)) {
                this.dnet.logger.error('Invalid message signature, closing connection...', null, 'Peers');
                newPeerSocket.close();
                return;
            }

            const message = JSON.parse(data.message);
            this.peerManager.setNodeConnection(message.nodeId, newPeerSocket);

            this.messageHandlers.forEach(handler => {
                handler.ReceivedPeerMessage(message, newPeerSocket);
            });

            if(message.reply_id && this.callbacks.has(message.reply_id)) {
                // Clear timeout when response is received
                if (this.callbackTimeouts.has(message.reply_id)) {
                    clearTimeout(this.callbackTimeouts.get(message.reply_id));
                    this.callbackTimeouts.delete(message.reply_id);
                }
                
                this.callbacks.get(message.reply_id)(message);
                this.callbacks.delete(message.reply_id);
            }
        });

        newPeerSocket.on('close', () => {
            const removedNodeId = this.peerManager.removeConnection(newPeerSocket, peerAddress);
            if (removedNodeId) {
                this.dnet.logger.info(`Node ${removedNodeId} disconnected`, 'Peers');
            }
        });

        newPeerSocket.on('error', (err) => {
            this.dnet.logger.error(`Error connecting to ${peerAddress}: ${err}`, null, 'Peers');
        });
    }

    checkProcess() {
        setInterval(() => {
            this.dnet.logger.verbose("Checking connections...", 'Peers');

            if (!this.ws) {
                this.dnet.logger.warn('WebSocket server is down, attempting to start...', 'Peers');
                this.attemptToBindWebSocketServer();
            }

            this.attemptPeerConnections();
        }, 5000);
    }

    async sendMessageAsync(socket, message, timeout = this.defaultTimeout) {
        return new Promise((resolve) => {
            try {
                // Create a callback that handles both success and timeout
                const callback = (response) => {
                    if (response.timedOut) {
                        resolve({ error: 'Request timed out', timedOut: true });
                    } else {
                        resolve(response);
                    }
                };

                this.sendMessage(socket, message, callback, timeout);
            } catch (err) {
                resolve({ error: err.message, timedOut: false });
            }
        });
    }
}

module.exports = Peers;