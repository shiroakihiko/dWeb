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

    sendMessage(socket, message, callback = null) {
        if (callback != null) {
            this.callbacks.set(message.id, callback);
        }
        socket.send(JSON.stringify(message));
    }

    sendAll(message) {
        this.peerManager.getConnectedPeers().forEach(peer => {
            this.sendMessage(peer, message);
        });
    }

    attemptToBindWebSocketServer() {
        try {
            this.ws = new WebSocket.Server({ port: this.port });
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
                this.callbacks.get(message.reply_id)(message);
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

    broadcastNewBlock(block) {
        const messageData = { type: 'block', block };
        this.peerManager.getConnectedPeers().forEach(peer => {
            this.sendMessage(peer, messageData);
        });
    }

    attemptPeerConnections() {
        const availablePeer = this.peerManager.getNextAvailablePeer();
        if(!availablePeer)
            return;
        
        this.connectToPeer(availablePeer);
    }

    connectToPeer(peerAddress) {
        const newPeerSocket = new WebSocket(`ws://${peerAddress}`);
        
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
                this.callbacks.get(message.reply_id)(message);
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
}

module.exports = Peers;