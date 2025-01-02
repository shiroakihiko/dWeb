const WebSocket = require('ws');

class SubscriptionServer {
    constructor(dnet, config) {
        this.dnet = dnet;
        this.users = new Map(); // Map to track users by their WebSocket connections
        this.topics = new Map(); // Map to track subscriptions to topics
        this.callbacks = new Map(); // Store message callbacks
        this.port = config.port || 3010;
        this.started = false;
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
            this.ws = new WebSocket.Server({ port: this.port });
            this.ws.on('connection', (socket, req) => {
                this.dnet.logger.info(`New connection established (Server-side): ${req.socket.remoteAddress}`, 'SubscriptionServer');
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
        // Store user connection
        this.users.set(socket, { socket, topics: new Set() });

        // Handle incoming messages
        socket.on('message', (message) => this.handleMessage(socket, message));

        // Handle connection close
        socket.on('close', () => this.handleClose(socket));
    }

    // Handle incoming messages
    handleMessage(socket, message) {
        try {
            const data = JSON.parse(message);
            const { action, topic, content } = data;

            switch (action) {
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
            this.dnet.logger.log(`User subscribed to topic: ${topic}`, 'SubscriptionServer');
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
    broadcastMessageToTopic(topic, content) {
        const topicSubscribers = this.topics.get(topic);
        if (topicSubscribers) {
            content.action = topic;
            topicSubscribers.forEach(socket => {
                this.sendMessage(socket, content);
            });
        }
    }

    // Send a message to a specific user (socket)
    sendMessage(socket, content) {
        if (this.users.has(socket)) {
            socket.send(JSON.stringify({ message: content }));
        }
    }

    // Handle user disconnection (socket close)
    handleClose(socket) {
        const user = this.users.get(socket);
        if (user) {
            user.topics.forEach(topic => {
                const topicSubscribers = this.topics.get(topic);
                if (topicSubscribers) {
                    topicSubscribers.delete(socket); // Remove user from all subscribed topics
                }
            });
            this.users.delete(socket); // Remove user from the user map
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
}

module.exports = SubscriptionServer;
