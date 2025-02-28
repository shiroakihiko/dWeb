class DeskSocketHandler
{
    // Todo: Remember subscriptions and reattach (subscribe) on reconnect
    constructor() {
        this.activeSockets = new Map(); // The socket connections by network ID
        this.activeSocketAddresses = new Map(); // The socket connections by address
        this.reconnectAttempts = new Map(); // Track reconnection attempts
        this.maxReconnectDelay = 30000; // Maximum delay between reconnection attempts (30 seconds)
        this.baseReconnectDelay = 1000; // Initial delay (1 second)
        this.lastMessageTimes = new Map(); // Track last message time for each socket
    }
    
    getSocket(networkId) {
        return this.activeSockets.get(networkId);
    }
    
    addSocket(networkId, port) {
        // Return if WS is already set for the network
        if(this.activeSockets.get(networkId))
            return;
            
        // Return existing instance if the address is shared with another network
        const wsAddress = `${window.location.hostname}:${port}`;
        if(this.activeSocketAddresses.get(wsAddress))
        {
            this.activeSockets.set(networkId, this.activeSocketAddresses.get(wsAddress));
            return;
        }
        
        this.initializeSocket(networkId, port);
    }

    initializeSocket(networkId, port) {
        const { protocol, wsAddress } = this.buildSocketAddress(port);
        const ws = new WebSocket(`${protocol}//${wsAddress}`);
        
        this.setupSocketEventHandlers(ws, networkId, port, wsAddress);
        this.trackSocket(ws, networkId, wsAddress);
    }

    buildSocketAddress(port) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsAddress = `${window.location.hostname}:${port}`;
        return { protocol, wsAddress };
    }

    setupSocketEventHandlers(ws, networkId, port, wsAddress) {
        ws.onopen = () => this.handleSocketOpen(ws, networkId);
        ws.onclose = () => this.handleSocketClose(networkId, port, wsAddress);
        ws.onmessage = (event) => this.handleSocketMessage(ws, networkId, event);
        ws.onerror = (error) => this.handleSocketError(networkId, error);
    }

    handleSocketOpen(ws, networkId) {
        console.log(`Socket connected for network ${networkId}`);
        //this.sendSubscription(ws);
        this.subscribeToAccount(networkId, desk.wallet.publicKey);
        this.reconnectAttempts.set(networkId, 0);
        ws.send(JSON.stringify({ method: 'ping' })); // send initial ping to get the socket id
    }

    sendSubscription(ws) {
        const subscribeMessage = JSON.stringify({
            method: 'subscribe',
            topic: 'action_confirmation',
            account: desk.wallet.publicKey
        });
        ws.send(subscribeMessage);
    }

    subscribeToAccount(networkId, account) {
        const ws = this.activeSockets.get(networkId);
        const subscribeMessage = JSON.stringify({
            method: 'subscribe_account',
            topic: 'action_confirmation',
            account: account
        });
        ws.send(subscribeMessage);
    }

    handleSocketClose(networkId, port, wsAddress) {
        console.log(`Socket closed for network ${networkId}. Attempting to reconnect...`);
        this.cleanupSocket(networkId, wsAddress);
        this.scheduleReconnection(networkId, port);
    }

    cleanupSocket(networkId, wsAddress) {
        this.activeSockets.delete(networkId);
        this.activeSocketAddresses.delete(wsAddress);
    }

    scheduleReconnection(networkId, port) {
        const delay = this.calculateReconnectDelay(networkId);
        
        setTimeout(() => {
            if (!this.activeSockets.has(networkId)) {
                console.log(`Attempting to reconnect network ${networkId} after ${delay}ms`);
                this.initializeSocket(networkId, port);
            }
        }, delay);
    }

    calculateReconnectDelay(networkId) {
        const attempts = this.reconnectAttempts.get(networkId) || 0;
        const delay = Math.min(
            this.baseReconnectDelay * Math.pow(2, attempts),
            this.maxReconnectDelay
        );
        this.reconnectAttempts.set(networkId, attempts + 1);
        return delay;
    }

    handleSocketMessage(ws, networkId, event) {
        try {
            this.lastMessageTimes.set(networkId, Date.now());
            const data = JSON.parse(event.data).message;
            if(data.method === 'pong') {
                ws.id = data.socketId;
                console.log(`Socket ID assigned: ${data.socketId}`);
                return;
            }

            desk.messageHandler.handleMessage(data);
        } catch (error) {
            console.error('Error processing websocket message:', error);
        }
    }

    handleSocketError(networkId, error) {
        console.error(`WebSocket error for network ${networkId}:`, error);
    }

    trackSocket(ws, networkId, wsAddress) {
        this.activeSockets.set(networkId, ws);
        this.activeSocketAddresses.set(wsAddress, ws);
    }

    // Add method to check socket health
    checkSocketHealth(networkId) {
        const socket = this.activeSockets.get(networkId);
        if (!socket) {
            console.log(`Socket health check failed - No socket for network ${networkId}`);
            return false;
        }

        const lastMessageTime = this.lastMessageTimes.get(networkId);
        const now = Date.now();
        const timeSinceLastMessage = now - (lastMessageTime || 0);
        
        console.log(`Socket health check for ${networkId}:`, {
            readyState: socket.readyState,
            lastMessageTime: lastMessageTime ? new Date(lastMessageTime).toISOString() : 'never',
            timeSinceLastMessage: `${Math.floor(timeSinceLastMessage/1000)}s`,
            isHealthy: socket.readyState === WebSocket.OPEN && timeSinceLastMessage < 60000
        });
        
        if (!lastMessageTime || timeSinceLastMessage > 60000) {
            console.log(`Socket ${networkId} timed out - No messages for ${Math.floor(timeSinceLastMessage/1000)}s`);
            return false;
        }
        
        return socket.readyState === WebSocket.OPEN;
    }

    getActiveSocketInfo() {
        const socketInfo = {};
        console.log('Getting active socket info...');
        console.log('Active sockets size:', this.activeSockets.size);
        
        for (const [networkId, socket] of this.activeSockets) {
            if (socket && socket.readyState === WebSocket.OPEN && socket.id) {
                // Get the socket address from the URL
                const url = new URL(socket.url);
                console.log(`Active socket found - Network: ${networkId}, ID: ${socket.id}, Address: ${url.host}`);
                socketInfo[networkId] = {
                    id: socket.id,
                    address: url.host
                };
            }
        }
        
        const result = JSON.stringify(socketInfo);
        console.log('Returning socket info:', result);
        return result;
    }
}