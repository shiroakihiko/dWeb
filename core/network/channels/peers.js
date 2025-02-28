const WebSocket = require('ws');
const msgpack = require('msgpack-lite');
const Signer = require('../../utils/signer');
const PeerManager = require('./peermanager');
const Hasher = require('../../utils/hasher');
const MessageQueue = require('./peers-message-queue');

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
        this.intervalCheck = null;

        // Priority queue per socket
        this.messageQueues = new Map(); // socket -> MessageQueue
        this.processingQueues = new Map(); // socket -> boolean
        
        // Message type priorities
        this.MESSAGE_PRIORITIES = {
            'election:vote': 'high',
            'blockProposal': 'high',
            'newActions': 'medium',
            'default': 'low'
        };

        // Add buffer tracking
        this.socketBuffers = new Map(); // socket -> current buffer size
    }

    Start() {
        if(this.started)
            return;

        this.ws = null;
        this.attemptToBindWebSocketServer();
        this.checkProcess();
        this.started = true;
    }
    Stop() {
        if (!this.started)
            return;

        clearInterval(this.intervalCheck);
        this.ws.close();
        this.started = false;
        this.messageQueues.forEach(queue => queue.cleanup());
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
        if (!this.messageQueues.has(socket)) {
            this.messageQueues.set(socket, new MessageQueue(socket, this.dnet.logger));
        }
        
        // Set priority based on message type if not already set
        if (!message.priority) {
            message.priority = this.MESSAGE_PRIORITIES[message.type] || this.MESSAGE_PRIORITIES.default;
        }

        const queue = this.messageQueues.get(socket);
        queue.addMessage(message, callback, timeout);
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
                this.setupPeerConnection(socket, req.socket.remoteAddress);
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

    // Shared connection handling methods
    async setupPeerConnection(socket, peerAddress) {
        this.dnet.logger.info(`New connection established - Address: ${peerAddress}`, 'Peers');
        
        // Log compression status
        const compressionEnabled = socket.extensions && 
                                 socket.extensions.includes('permessage-deflate');
        this.dnet.logger.info(
            `Connection compression: ${compressionEnabled ? 'enabled' : 'disabled'}`,
            'Peers'
        );

        this.peerManager.addConnection(socket, peerAddress);
        
        // Create message queue for new socket
        const queue = new MessageQueue(socket, this.dnet.logger);
        this.messageQueues.set(socket, queue);

        // Set up event handlers
        this.setupSocketEventHandlers(socket, peerAddress);
    }

    setupSocketEventHandlers(socket, peerAddress) {
        // Set up binary message handling
        socket.binaryType = 'nodebuffer';
        
        socket.on('message', async (packedData) => {
            try {
                // Decode the message envelope
                let envelope;
                try {
                    envelope = msgpack.decode(packedData);
                } catch (err) {
                    this.dnet.logger.error(`Failed to decode message envelope: ${err}`, null, 'Peers');
                    return;
                }

                for(let packet of envelope.messages)
                {
                    // Verify the message
                    if (!(await this.verifyMessage(packet, socket))) {
                        this.dnet.logger.error('Invalid message signature, closing connection...', null, 'Peers');
                        socket.close();
                        return;
                    }
                    const message = JSON.parse(packet.message);

                    // Extract the actual message
                    this.peerManager.setNodeConnection(message.nodeId, socket);
                    
                    // Handle response callbacks
                    const queue = this.messageQueues.get(socket);
                    if (queue) queue.handleResponse(message);
                    
                    this.passToMessageHandler(message, socket);
                }

            } catch (error) {
                this.dnet.logger.error(`Message handling error: ${error}`, null, 'Peers');
            }
        });

        socket.on('close', () => {
            const queue = this.messageQueues.get(socket);
            if (queue) queue.cleanup();
            this.messageQueues.delete(socket);
            
            const removedNodeId = this.peerManager.removeConnection(socket, peerAddress);
            if (removedNodeId) {
                this.dnet.logger.info(`Node ${removedNodeId} disconnected`, 'Peers');
            }
        });

        socket.on('error', (err) => {
            this.dnet.logger.error(`Socket error for ${peerAddress}: ${err}`, null, 'Peers');
        });
    }

    // Client-side connection handler
    connectToPeer(peerAddress) {
        const newPeerSocket = new WebSocket(`ws://${peerAddress}`, { 
            perMessageDeflate: true 
        });
        
        newPeerSocket.on('open', () => {
            this.setupPeerConnection(newPeerSocket, peerAddress);
        });

        // Add error handler specifically for connection attempts
        newPeerSocket.on('error', (err) => {
            this.dnet.logger.error(`Failed to connect to ${peerAddress}: ${err}`, null, 'Peers');
        });
    }

    passToMessageHandler(message, socket) {
        this.messageHandlers.forEach(handler => {
            handler.ReceivedPeerMessage(message, socket);
        });
    }

    attemptPeerConnections() {
        const availablePeer = this.peerManager.getNextAvailablePeer();
        if(!availablePeer)
            return;
        
        this.connectToPeer(availablePeer);
    }

    async verifyMessage(envelope, socket) {
        try {
            // Check if we have the required fields
            if (!envelope || !envelope.message || !envelope.signature) {
                this.dnet.logger.warn('Invalid message format - missing message or signature');
                return false;
            }
            
            // The message is already an object since it was decoded from msgpack
            const { message, signature } = envelope;
            const parsedMessage = JSON.parse(message);

            // Get the node ID from the decoded message
            const publicKey = parsedMessage.nodeId;
            if (!publicKey) {
                this.dnet.logger.warn('Invalid message format - missing nodeId');
                return false;
            }


            // Verify the signature using the original message object
            const validSignature = await Signer.verifySignatureWithPublicKey(
                message,  // Use the decoded message object directly
                signature,
                publicKey
            );

            if (!validSignature) {
                this.dnet.logger.warn('Invalid signature for message');
            }

            return validSignature;
        } catch (error) {
            this.dnet.logger.error(`Error verifying message: ${error.message}`);
            return false;
        }
    }

    checkProcess() {
        this.intervalCheck = setInterval(() => {
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