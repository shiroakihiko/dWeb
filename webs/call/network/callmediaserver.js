const WebSocket = require('ws');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

class CallMediaServer {
    constructor(network, config) {
        this.network = network;
        this.wsPort = config.mediaWsPort || 8444;
        this.wssPort = config.mediaWssPort || 8445;
        this.certPath = config.certPath || path.join(__dirname, 'certs');
        this.channels = new Map();
        this.started = false;
        this.servers = {
            ws: null,
            wss: null
        };
        this.participantSockets = new Map();
        this.channelParticipants = new Map()
        this.timerCheckProcess = null;
    }

    Start(node) {
        if (this.started) return;

        this.node = node;
        this.attemptToBindWebSocketServers();
        this.started = true;
        this.checkProcess();
    }

    Stop() {
        clearInterval(this.timerCheckProcess);
        if (this.servers.ws) {
            this.servers.ws.close();
        }
        if (this.servers.wss) {
            this.servers.wss.close();
        }
        if (this.httpServer) {
            this.httpServer.close();
        }
        if (this.httpsServer) {
            this.httpsServer.close();
        }
    }

    attemptToBindWebSocketServers() {
        try {
            // Setup WS server
            this.httpServer = http.createServer();
            this.servers.ws = new WebSocket.Server({ server: this.httpServer });
            this.httpServer.listen(this.wsPort);
            
            // Setup WSS server if SSL certificates exist
            try {
                // Certificate paths
                const privateKey = fs.readFileSync(path.join(this.certPath, 'server.key'), 'utf8');
                const certificate = fs.readFileSync(path.join(this.certPath, 'server.crt'), 'utf8');
                const credentials = { key: privateKey, cert: certificate };

                if (fs.existsSync(this.certPath) && fs.existsSync(this.certPath)) {
                    this.httpsServer = https.createServer(credentials);
                    this.servers.wss = new WebSocket.Server({ server: this.httpsServer });
                    this.httpsServer.listen(this.wssPort);
                    this.node.info(`WSS server started on port ${this.wssPort}`);
                } else {
                    this.node.warn('SSL certificates not found, WSS server not started');
                }
            } catch (error) {
                this.node.error(`Error starting WSS server: ${error}`);
            }

            // Setup connection handlers for both servers
            Object.entries(this.servers).forEach(([type, server]) => {
                if (server) {
                    server.on('connection', (socket, req) => {
                        this.node.info(`New ${type.toUpperCase()} media connection established: ${req.socket.remoteAddress}`);
                        this.handleNewConnection(socket, req);
                    });

                    server.on('error', (err) => {
                        this.node.error(`${type.toUpperCase()} Media WebSocket server error:`, err.code);
                        this.servers[type] = null;
                    });
                }
            });

            this.node.info(`WS server started on port ${this.wsPort}`);

        } catch (error) {
            this.node.error(`Media WebSocket servers binding failed: ${error}`);
            this.servers.ws = null;
            this.servers.wss = null;
        }
    }

    handleNewConnection(socket, req) {
        socket.binaryType = 'arraybuffer';
        
        socket.on('message', async (message, isBinary) => {
            try {
                if (isBinary) {
                    // Handle binary media data with participant info
                    this.handleMediaData(socket, message);
                } else {
                    const data = JSON.parse(message.toString());
                    switch (data.method) {
                        case 'subscribe':
                            await this.handleSubscribe(socket, data);
                            break;
                        case 'unsubscribe':
                            await this.handleUnsubscribe(socket, data);
                            break;
                        case 'participantInfo':
                            this.handleParticipantInfo(socket, data);
                            break;
                    }
                }
            } catch (error) {
                this.node.error(`Error handling media message: ${error}`);
            }
        });

        socket.on('close', () => this.handleDisconnect(socket));
    }

    handleParticipantInfo(socket, data) {
        const { participantId, channelId } = data;
        if (participantId && channelId) {
            this.participantSockets.set(participantId, socket);
            socket.participantId = participantId;
            
            // Update channel participants
            if (!this.channelParticipants.has(channelId)) {
                this.channelParticipants.set(channelId, new Set());
            }
            this.channelParticipants.get(channelId).add(participantId);
            
            // Notify other participants
            this.broadcastChannelState(channelId);
        }
    }

    broadcastChannelState(channelId) {
        const participants = this.channelParticipants.get(channelId);
        if (!participants) return;

        const message = JSON.stringify({
            type: 'channelState',
            channelId,
            participants: Array.from(participants)
        });

        participants.forEach(participantId => {
            const socket = this.participantSockets.get(participantId);
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(message);
            }
        });
    }

    handleMediaData(socket, data) {
        const channelId = socket.channelId;
        if (!channelId) return;

        const participants = this.channelParticipants.get(channelId);
        if (!participants) return;

        // Get sender's participant ID
        const senderId = socket.participantId;
        if (!senderId) return;

        // Let's add debug logging
        console.log('Forwarding media from participant:', senderId, 'length:', senderId.length);

        participants.forEach(participantId => {
            if (participantId === senderId) return;

            const recipientSocket = this.participantSockets.get(participantId);
            if (recipientSocket && recipientSocket.bufferedAmount < 1024 * 1024 && recipientSocket.readyState === WebSocket.OPEN) {
                try {
                    // Change the packet structure to accommodate full 64-byte IDs
                    const originalData = new Uint8Array(data);
                    const packet = new Uint8Array(1 + 64 + (originalData.length - 1)); // Changed from 32 to 64
                    packet[0] = originalData[0];
                    
                    // Use the full sender ID
                    const senderIdBytes = new TextEncoder().encode(senderId);
                    packet.set(senderIdBytes, 1); // This will now fit the full 64-byte ID
                    
                    // Adjust offset for the rest of the data
                    packet.set(originalData.slice(1), 65); // Changed from 33 to 65
                    
                    recipientSocket.send(packet.buffer);
                } catch (error) {
                    this.node.error(`Error forwarding media data: ${error}`);
                }
            }
        });
    }

    handleDisconnect(socket) {
        const { channelId, participantId } = socket;
        if (channelId && participantId) {
            // Remove from channel participants
            const participants = this.channelParticipants.get(channelId);
            if (participants) {
                participants.delete(participantId);
                if (participants.size === 0) {
                    this.channelParticipants.delete(channelId);
                } else {
                    this.broadcastChannelState(channelId);
                }
            }

            // Remove from participant sockets
            this.participantSockets.delete(participantId);
        }
    }

    checkProcess() {
        this.timerCheckProcess = setInterval(() => {
            if (!this.servers.ws && !this.servers.wss) {
                this.node.verbose('All Media WebSocket servers are down, attempting to restart...');
                this.attemptToBindWebSocketServers();
            } else {
                if (!this.servers.ws) {
                    this.node.verbose('WS server is down, attempting to restart...');
                }
                if (!this.servers.wss) {
                    this.node.verbose('WSS server is down, attempting to restart...');
                }
            }
        }, 5000);
    }

    // Add method to check connection health
    checkConnectionHealth() {
        this.participantSockets.forEach((socket, participantId) => {
            if (socket.readyState === WebSocket.OPEN) {
                // Check bufferedAmount to detect potential issues
                if (socket.bufferedAmount > 5 * 1024 * 1024) { // 5MB threshold
                    this.node.warn(`High buffer for participant ${participantId}: ${socket.bufferedAmount} bytes`);
                }
            }
        });
    }

    handleSubscribe(socket, data) {
        const { channelId, participantId } = data;
        if (!channelId || !participantId) return;

        // Add debug logging
        console.log('Participant subscribing:', participantId, 'length:', participantId.length);

        socket.channelId = channelId;
        socket.participantId = participantId;  // Store the full ID

        if (!this.channelParticipants.has(channelId)) {
            this.channelParticipants.set(channelId, new Set());
        }
        // Store the full participant ID
        this.channelParticipants.get(channelId).add(participantId);
        this.participantSockets.set(participantId, socket);

        // Broadcast updated participant list to all channel members
        this.broadcastChannelState(channelId);
    }
}

module.exports = CallMediaServer; 