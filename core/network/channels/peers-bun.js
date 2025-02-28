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
        
        try {
            // Bun's WebSocket.send() doesn't take a callback
            socket.send(rawMessage);
        } catch (error) {
            this.dnet.logger.error(`Failed to send message: ${error}`, null, 'Peers');
        }
    }

    sendAll(message) {
        this.peerManager.getConnectedPeers().forEach(peer => {
            this.sendMessage(peer, message);
        });
    }

    attemptToBindWebSocketServer() {
        try {
            this.ws = Bun.serve({
                port: this.port,
                fetch(req, server) {
                    // Upgrade HTTP requests to WebSocket
                    if (server.upgrade(req)) {
                        return;
                    }
                    return new Response("Upgrade failed", { status: 500 });
                },
                websocket: {
                    open: (ws) => {
                        const remoteAddress = ws.remoteAddress;
                        this.dnet.logger.info(`New connection established (Server-side): ${remoteAddress}`, 'Peers');
                        this.handleNewConnection(ws, { socket: { remoteAddress } });
                    },
                    message: async (ws, message) => {
                        try {
                            const data = JSON.parse(message);
                            if (!await this.verifyMessage(data, ws)) {
                                this.dnet.logger.error('Invalid message signature, closing connection...', null, 'Peers');
                                ws.close();
                                return;
                            }

                            const parsedMessage = JSON.parse(data.message);
                            this.peerManager.setNodeConnection(parsedMessage.nodeId, ws);
                            this.passToMessageHandler(parsedMessage, ws);

                            if(parsedMessage.reply_id && this.callbacks.has(parsedMessage.reply_id)) {
                                if (this.callbackTimeouts.has(parsedMessage.reply_id)) {
                                    clearTimeout(this.callbackTimeouts.get(parsedMessage.reply_id));
                                    this.callbackTimeouts.delete(parsedMessage.reply_id);
                                }
                                
                                this.callbacks.get(parsedMessage.reply_id)(parsedMessage);
                                this.callbacks.delete(parsedMessage.reply_id);
                            }
                        } catch (error) {
                            this.dnet.logger.error(`Error processing message: ${error}`, null, 'Peers');
                        }
                    },
                    close: (ws) => {
                        const removedNodeId = this.peerManager.removeConnection(ws, ws.remoteAddress);
                        if (removedNodeId) {
                            this.dnet.logger.info(`Node ${removedNodeId} disconnected`, 'Peers');
                        }
                    },
                }
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

        // Remove the socket.on handlers since Bun's WebSocket server already handles these events
        // in the Bun.serve websocket configuration
    }

    async verifyMessage(messageData, socket) {
        const { message, signature } = messageData;
        if(!message || !signature)
            return false;
        
        const publicKey = JSON.parse(message).nodeId;
        return await Signer.verifySignatureWithPublicKey(message, signature, publicKey);
    }

    attemptPeerConnections() {
        const availablePeer = this.peerManager.getNextAvailablePeer();
        if(!availablePeer)
            return;
        
        this.connectToPeer(availablePeer);
    }

    connectToPeer(peerAddress) {
        const newPeerSocket = new WebSocket(`ws://${peerAddress}`);
        
        newPeerSocket.addEventListener('open', () => {
            this.dnet.logger.info(`Connected to new peer: ${peerAddress}`, 'Peers');
            this.peerManager.addConnection(newPeerSocket, peerAddress);
        });

        newPeerSocket.addEventListener('message', async (event) => {
            try {
                const data = JSON.parse(event.data);
                if (!await this.verifyMessage(data, newPeerSocket)) {
                    this.dnet.logger.error('Invalid message signature, closing connection...', null, 'Peers');
                    newPeerSocket.close();
                    return;
                }

                const message = JSON.parse(data.message);
                this.peerManager.setNodeConnection(message.nodeId, newPeerSocket);
                this.passToMessageHandler(message, newPeerSocket);

                if(message.reply_id && this.callbacks.has(message.reply_id)) {
                    if (this.callbackTimeouts.has(message.reply_id)) {
                        clearTimeout(this.callbackTimeouts.get(message.reply_id));
                        this.callbackTimeouts.delete(message.reply_id);
                    }
                    
                    this.callbacks.get(message.reply_id)(message);
                    this.callbacks.delete(message.reply_id);
                }
            } catch (error) {
                this.dnet.logger.error(`Error processing message: ${error}`, null, 'Peers');
            }
        });

        newPeerSocket.addEventListener('close', () => {
            const removedNodeId = this.peerManager.removeConnection(newPeerSocket, peerAddress);
            if (removedNodeId) {
                this.dnet.logger.info(`Node ${removedNodeId} disconnected`, 'Peers');
            }
        });

        newPeerSocket.addEventListener('error', (err) => {
            this.dnet.logger.error(`Error connecting to ${peerAddress}: ${err}`, null, 'Peers');
        });
    }

    passToMessageHandler(message, socket) {
        this.messageHandlers.forEach(handler => {
            handler.ReceivedPeerMessage(message, socket);
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