const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const https = require('https');

class SubscriptionServer {
    constructor(dnet, config) {
        this.dnet = dnet;
        this.users = new Map(); // Map to track users by their WebSocket connections
        this.topics = new Map(); // Map to track subscriptions to topics
        this.messageHandlers = new Map(); // Add this line to store message handlers
        this.notificationCache = new Map(); // Cache for pending notifications by socket
        this.port = config.port || 3010;
        this.started = false;
        this.useSSL = config.useSSL || false;  // Add SSL flag
        this.shadowSockets = new Map(); // Map to track shadow sockets
        
        // Only load certificates if SSL is enabled
        if (this.useSSL) {
            this.credentials = {
                key: fs.readFileSync(path.join(config.certPath, 'server.key'), 'utf8'),
                cert: fs.readFileSync(path.join(config.certPath, 'server.crt'), 'utf8')
            };
        }
    }

    // Start the WebSocket server
    Start() {
        if (this.started) return;

        this.ws = null;
        this.attemptToBindWebSocketServer();
        this.started = true;
        this.checkProcess();
    }

    // Attempt to bind WebSocket server to the specified port
    attemptToBindWebSocketServer() {
        try {
            if (this.useSSL) {
                // Create HTTPS server for SSL
                const httpsServer = https.createServer(this.credentials);
                httpsServer.listen(this.port);
                this.ws = new WebSocket.Server({ server: httpsServer });
            } else {
                // Standard WebSocket server without SSL
                this.ws = new WebSocket.Server({ port: this.port });
            }

            this.ws.on('connection', (socket, req) => {
                this.handleNewConnection(socket, req);
            });

            this.ws.on('error', (err) => {
                this.dnet.logger.error('WebSocket server binding failed:', err.code, 'SubscriptionServer');
                this.ws = null; // Reset ws server if binding fails
            });
        } catch (error) {
            this.dnet.logger.error(`WebSocket server binding failed: ${error}`, 'SubscriptionServer');
            this.ws = null;
        }
    }

    // Handle a new WebSocket connection
    handleNewConnection(socket, req) {
        const socketId = req.headers['x-socket-id'];
        
        if (socketId) {
            // This is a shadow socket connection
            this.dnet.logger.log(`New shadow connection with ID ${socketId}`, 'SubscriptionServer');
            socket.shadowId = socketId; // Store the original socketId
        } else {
            // Generate a unique ID for primary socket
            socket.id = Math.random().toString(36).substring(2) + Date.now().toString(36);
            this.dnet.logger.log(`New primary connection established: ${socket.id}`, 'SubscriptionServer');
            // Store user connection
            this.users.set(socket, { socket, topics: new Set() });
        }

        // Handle incoming messages
        socket.on('message', (message) => this.handleMessage(socket, message));

        // Handle connection close
        socket.on('close', (code, reason) => {
            this.handleClose(socket);
        });

        // Handle errors
        socket.on('error', (error) => {
            this.dnet.logger.error(`Socket error: ${error}`, error, 'SubscriptionServer');
        });
    }

    // Handle incoming messages
    handleMessage(socket, message) {
        try {
            const data = JSON.parse(message);
            const { action, topic, content, networkId } = data;

            // Check for custom message handler first
            const handler = this.messageHandlers.get(action);
            if (handler) {
                handler(socket, data);
                return;
            }

            // Default handlers
            switch (action) {
                case 'ping':
                    this.sendMessage(socket, { 
                        action: 'pong', 
                        socketId: socket.id 
                    });
                    break;
                case 'register_shadow':
                    this.registerShadowSocket(socket, data.socketId, networkId);
                    break;
                case 'subscribe':
                    this.subscribeUserToTopic(socket, topic);
                    break;
                case 'unsubscribe':
                    this.unsubscribeUserFromTopic(socket, topic);
                    break;
                default:
                    this.dnet.logger.verbose(`User chose unsupported action: ${action}`, null, 'SubscriptionServer');
            }
        } catch (error) {
            this.dnet.logger.error(`Error handling message: ${error}`, error, 'SubscriptionServer');
        }
    }

    // Subscribe a user to a topic
    subscribeUserToTopic(socket, topic) {
        const user = this.users.get(socket);
        if (user) {
            user.topics.add(topic);
            if (!this.topics.has(topic)) {
                this.topics.set(topic, new Set());
            }
            this.topics.get(topic).add(socket); // Add user to topic's subscriber list
            this.dnet.logger.log(`User subscribed to topic: ${topic}, ${socket.id}`, 'SubscriptionServer');
        }
    }

    // Unsubscribe a user from a topic
    unsubscribeUserFromTopic(socket, topic) {
        const user = this.users.get(socket);
        if (user) {
            user.topics.delete(topic);
            const topicSubscribers = this.topics.get(topic);
            if (topicSubscribers) {
                topicSubscribers.delete(socket); // Remove user from topic's subscriber list
            }
            this.dnet.logger.log(`User unsubscribed from topic: ${topic}`, 'SubscriptionServer');
        }
    }

    // Broadcast a message to all users subscribed to a topic
    async broadcastMessageToTopic(topic, content) {
        const topicSubscribers = this.topics.get(topic);
        if (topicSubscribers) {
            content.topic = topic;
            this.dnet.logger.log(`Broadcasting message to topic ${topic} - ${topicSubscribers.size} subscribers`);
            
            topicSubscribers.forEach(socket => {
                try {
                    if (socket.readyState === 1) { // WebSocket.OPEN
                        this.dnet.logger.log(`Sending to socket ${socket.id}`);
                        this.sendMessage(socket, content);
                        
                        // Also send to shadow socket if exists
                        const shadowInfo = this.shadowSockets.get(socket.id);
                        if (shadowInfo && shadowInfo.socket.readyState === 1) {
                            this.dnet.logger.log(`Sending to shadow socket for ${socket.id}`);
                            this.sendMessage(shadowInfo.socket, content);
                        } else {
                            this.dnet.logger.log(`No healthy shadow socket for ${socket.id}`);
                        }
                    }
                } catch (error) {
                    this.dnet.logger.error(`Error sending message: ${error}`, error, 'SubscriptionServer');
                }
            });
        }
    }

    // Send a message to a specific user (socket)
    sendMessage(socket, content) {
        try {
            if (socket.shadowId || socket.readyState === 1) {
                socket.send(JSON.stringify({ message: content }));
            }
        } catch (error) {
            this.dnet.logger.error(`Error sending message: ${error}`, error, 'SubscriptionServer');
            // Force close the socket if we can't send to it
            this.handleClose(socket);
        }
    }

    // Handle user disconnection (socket close)
    handleClose(socket) {
        if (socket.shadowId) {
            this.shadowSockets.delete(socket.shadowId);
        } else if (socket.id) {
            // Only remove from users if it's a primary socket
            if (!socket.shadowId) {
                this.users.delete(socket);
                // Clean up any shadow sockets for this ID
                this.shadowSockets.delete(socket.id);
            }
        }

        const user = this.users.get(socket);
        if (user) {
            user.topics.forEach(topic => {
                const topicSubscribers = this.topics.get(topic);
                if (topicSubscribers) {
                    topicSubscribers.delete(socket);
                }
            });
            this.dnet.logger.log('User disconnected', 'SubscriptionServer');
        }
    }

    // Keep the process alive with periodic checks (for example, to monitor connections)
    checkProcess() {
        setInterval(() => {
            this.dnet.logger.log("Checking WebSocket server and user connections...", 'SubscriptionServer');
            if (!this.ws) {
                this.dnet.logger.log('WebSocket server is down, attempting to start...', 'SubscriptionServer');
                this.attemptToBindWebSocketServer();
            }
        }, 5000); // Check every 5 seconds
    }

    // Add this new method
    AddMessageHandler(action, callback) {
        this.messageHandlers.set(action, callback);
    }

    registerShadowSocket(socket, socketId, networkId) {
        // Store the shadow socket with reference to original socketId
        this.shadowSockets.set(socketId, { socket, networkId });
        this.dnet.logger.log(`Registered shadow socket for ${socketId}`, 'SubscriptionServer');
    }
}

module.exports = SubscriptionServer;
