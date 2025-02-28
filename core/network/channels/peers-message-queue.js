const WebSocket = require('ws');
const msgpack = require('msgpack-lite');

class MessageQueue {
    constructor(socket, logger) {
        this.socket = socket;
        this.logger = logger;
        this.queues = {
            high: [],
            medium: [],
            low: []
        };
        this.isProcessing = false;
        this.currentBuffer = 0;
        this.callbacks = new Map();
        this.callbackTimeouts = new Map();

        // Increased buffer thresholds
        this.BUFFER_THRESHOLDS = {
            high: 8 * 1024 * 1024,    // 8MB for high priority
            medium: 4 * 1024 * 1024,  // 4MB for medium
            low: 2 * 1024 * 1024      // 2MB for low
        };

        // Add monitoring interval
        setInterval(() => {
            if (this.hasBacklog()) {
                this.logger.warn(
                    `Queue backlog detected:\n` +
                    `Buffer size: ${(this.currentBuffer / 1024 / 1024).toFixed(2)}MB\n` +
                    `Processing state: ${this.isProcessing}\n` +
                    `Socket state: ${this.socket.readyState}\n` +
                    `Stopped: ${this.stopped || false}`
                );
            }
        }, 5000);
    }

    addMessage(message, callback = null, timeout = 30000) {
        const priority = message.priority || 'low';
        
        const messageObj = {
            message,
            callback,
            timeout,
            timeoutId: null
        };

        this.queues[priority].push(messageObj);
    
        this.logger.debug(
            `Added message (${message.message.type}) to ${priority} queue. Queue lengths: High[${this.queues.high.length}], Medium[${this.queues.medium.length}], Low[${this.queues.low.length}]`
        );

        // Start processing if not already
        if (!this.isProcessing) {
            this.isProcessing = true;
            setTimeout(() => this.processQueue(), 50);
        }
    }

    processQueue() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.stopped) {
            this.logger.warn(
                `Queue processing stopped: ${!this.socket ? 'No socket' : 
                this.stopped ? 'Stopped' : 'Socket not open'}`
            );
            this.isProcessing = false;
            return;
        }

        const envelope = { messages: [] };
        let messageSize = 0;
        // Process up to 10 messages per cycle
        for (let i = 0; i < 10; i++) {
            const next = this.getNextMessage();
            if (!next) {
                this.isProcessing = false;
                break;
            }

            const { message: messageObj, priority } = next;

            try {
                // Use msgpack instead of JSON.stringify
                /*
                this.updateBuffer(messageSize, true);
*/
                if (messageObj.callback) {
                    this.callbacks.set(messageObj.message.id, messageObj.callback);
                    if (messageObj.timeout) {
                        const timeoutId = setTimeout(() => {
                            if (this.callbacks.has(messageObj.message.id)) {
                                this.callbacks.get(messageObj.message.id)({
                                    error: 'Timeout waiting for response',
                                    timedOut: true
                                });
                                this.callbacks.delete(messageObj.message.id);
                                this.callbackTimeouts.delete(messageObj.message.id);
                            }
                        }, messageObj.timeout);
                        this.callbackTimeouts.set(messageObj.message.id, timeoutId);
                    }
                }

                envelope.messages.push(messageObj.message);

            } catch (error) {
                this.logger.error(`Failed to process message: ${error}`, null, 'MessageQueue');
                if (messageObj.callback) {
                    messageObj.callback({ error: error.message });
                }
            }
        }

        if(envelope.messages.length > 0)
        {
            const packedMessages = msgpack.encode(envelope);
            // Send binary data
            this.socket.send(packedMessages, { binary: true }, (error) => {
                this.updateBuffer(messageSize, false);
            });
        }

        // Continue processing if there are more messages
        if (this.hasMessages()) {
            setTimeout(() => this.processQueue(), 50);
        } else {
            this.isProcessing = false;
        }
    }

    handleResponse(message) {
        if (message.reply_id && this.callbacks.has(message.reply_id)) {
            // Clear timeout
            if (this.callbackTimeouts.has(message.reply_id)) {
                clearTimeout(this.callbackTimeouts.get(message.reply_id));
                this.callbackTimeouts.delete(message.reply_id);
            }
            
            // Execute callback and delete it
            this.callbacks.get(message.reply_id)(message);
            this.callbacks.delete(message.reply_id);
        }
    }

    getNextMessage() {
        const priorities = ['high', 'medium', 'low'];
        
        for (const priority of priorities) {
            if (this.queues[priority].length > 0) {
                return {
                    message: this.queues[priority].shift(),
                    priority
                };
            }
        }
        return null;
    }

    updateBuffer(size, increase = true) {
        if (increase) {
            this.currentBuffer += size;
        } else {
            this.currentBuffer = Math.max(0, this.currentBuffer - size);
        }
    }

    canSendPriority(priority) {
        return this.currentBuffer <= this.BUFFER_THRESHOLDS[priority];
    }

    hasMessages() {
        return this.queues.high.length > 0 || 
               this.queues.medium.length > 0 || 
               this.queues.low.length > 0;
    }

    getQueueState() {
        return {
            high: this.queues.high.length,
            medium: this.queues.medium.length,
            low: this.queues.low.length,
            currentBuffer: this.currentBuffer
        };
    }

    cleanup() {
        this.isProcessing = false;
        this.callbacks.clear();
        this.callbackTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        this.callbackTimeouts.clear();
    }

    hasBacklog() {
        return this.queues.medium.length > 10 || this.queues.low.length > 10;
    }
}

module.exports = MessageQueue;