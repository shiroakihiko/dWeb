const net = require('net');
const EventEmitter = require('events');

class SignerClusterClient extends EventEmitter {
    constructor(port = 31337) {
        super();
        this.port = port;
        this.pendingRequests = new Map();
        this.connected = false;
        this.connecting = false;
        this.nextRequestId = 1;
        this.buffer = '';
        
        // Configuration
        this.retryDelay = 1000;      // 1 second between retries
        this.connectionTimeout = 10000; // 10 seconds connection timeout
        this.requestTimeout = 5000;   // 5 seconds request timeout
        this.maxFailures = 3;        // Max failures before stopping retries
        this.failureCount = 0;
        this.lastResetTime = Date.now();
        this.resetInterval = 60000;   // Reset failure count every minute
        
        this.connect();
    }

    connect() {
        if (this.connecting || this.connected) return;
        this.connecting = true;

        this.socket = new net.Socket();
        
        const connectionTimeout = setTimeout(() => {
            if (!this.connected) {
                this.socket.destroy();
                this.handleDisconnect(new Error('Connection timeout'));
            }
        }, this.connectionTimeout);

        this.socket.connect(this.port, '127.0.0.1', () => {
            clearTimeout(connectionTimeout);
            this.connected = true;
            this.connecting = false;
            this.failureCount = 0;
            this.emit('connected');
        });

        this.socket.on('data', (data) => this.handleData(data));
        this.socket.on('error', (err) => {
            clearTimeout(connectionTimeout);
            this.handleDisconnect(err);
        });
        this.socket.on('close', () => {
            clearTimeout(connectionTimeout);
            this.handleDisconnect(new Error('Connection closed'));
        });
    }

    handleData(data) {
        this.buffer += data.toString();
        const messages = this.buffer.split('\n');
        this.buffer = messages.pop();
        
        for (const line of messages) {
            if (!line.trim()) continue;
            
            try {
                const response = JSON.parse(line);
                const resolver = this.pendingRequests.get(response.id);
                if (resolver) {
                    clearTimeout(resolver.timeoutId);
                    this.pendingRequests.delete(response.id);
                    
                    if (response.error) {
                        resolver.reject(new Error(response.error));
                    } else {
                        resolver.resolve(response.result);
                    }
                }
            } catch (err) {
                console.error('Error processing response:', err);
            }
        }
    }

    handleDisconnect(error) {
        if (!this.connected && !this.connecting) return;

        this.connected = false;
        this.connecting = false;
        this.failureCount++;
        this.emit('disconnected', error);
        
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
            this.socket = null;
        }

        // Reject all pending requests
        for (const [id, resolver] of this.pendingRequests) {
            clearTimeout(resolver.timeoutId);
            resolver.reject(new Error('Connection lost'));
            this.pendingRequests.delete(id);
        }

        // Attempt reconnect if not too many failures
        if (this.failureCount < this.maxFailures) {
            setTimeout(() => this.connect(), this.retryDelay);
        }
    }

    async request(type, message, privateKey = null, signature = null, publicKey = null, batch = null) {
        if (this.failureCount >= this.maxFailures) {
            this.resetFailureCount();
        }

        const id = this.nextRequestId++;
        const request = { id, type, message, privateKey, signature, publicKey, batch };

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error('Request timeout'));
            }, this.requestTimeout);

            this.pendingRequests.set(id, { resolve, reject, timeoutId });

            if (!this.connected) {
                this.connect();
            }

            try {
                this.socket.write(JSON.stringify(request) + '\n');
            } catch (err) {
                clearTimeout(timeoutId);
                this.pendingRequests.delete(id);
                reject(err);
            }
        });
    }

    async sign(message, privateKey) {
        return this.retryOperation(() => 
            this.request('sign', message, privateKey));
    }

    async verify(message, signature, publicKey) {
        return this.retryOperation(() => 
            this.request('verify', message, null, signature, publicKey));
    }

    async batchVerify(messages, signatures, publicKeys) {
        return this.retryOperation(() => 
            this.request('batchVerify', null, null, null, null, {
                messages,
                signatures,
                publicKeys
            }));
    }

    async retryOperation(operation) {
        while (true) {
            try {
                return await operation();
            } catch (err) {
                if (this.failureCount >= this.maxFailures) {
                    throw err;
                }
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            }
        }
    }

    resetFailureCount() {
        const now = Date.now();
        if (now - this.lastResetTime > this.resetInterval) {
            this.failureCount = 0;
            this.lastResetTime = now;
        }
    }

    destroy() {
        this.removeAllListeners();
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
        }
        for (const [id, resolver] of this.pendingRequests) {
            clearTimeout(resolver.timeoutId);
            this.pendingRequests.delete(id);
        }
    }
}

module.exports = SignerClusterClient; 