const http = require('http');
const fs = require('fs');
const path = require('path');

class RPC {
    constructor(dnet, config) {
        this.dnet = dnet;
        this.maxRetries = 5;  // Maximum retries before giving up
        this.retryDelay = 5000;  // Delay between retries in milliseconds (e.g., 5 seconds)
        this.requestCounts = {};  // Placeholder for throttling logic (to be implemented)
        this.messageHandlers = []; // Array to hold multiple message handlers
        this.started = false;
        this.port = config.RPCPort;
        this.useSSL = config.useSSL || false;  // Add SSL flag
        this.server = null;
        
        // Only load certificates if SSL is enabled
        if (this.useSSL) {
            this.credentials = {
                key: fs.readFileSync(path.join(config.certPath, 'server.key'), 'utf8'),
                cert: fs.readFileSync(path.join(config.certPath, 'server.crt'), 'utf8')
            };
        }
    }

    Start() {
        if (this.started)
            return;

        this.setupRPC();
        this.started = true;
    }
    Stop() {
        if (!this.started)
            return;

        this.started = false;
        this.server.close();
    }

    // Add a new message handler
    AddMessageHandler(messageHandler) {
        this.messageHandlers.push(messageHandler);
    }

    // Remove a message handler
    RemoveMessageHandler(messageHandler) {
        const index = this.messageHandlers.indexOf(messageHandler);
        this.messageHandlers.splice(index, 1);
    }

    async setupRPC() {
        let retries = 0;

        const startServer = () => {
            // Create server based on SSL configuration
            this.server = this.useSSL 
                ? require('https').createServer(this.credentials, this.requestHandler.bind(this))
                : http.createServer(this.requestHandler.bind(this));

            this.server.listen(this.port, () => {
                this.dnet.logger.info(`RPC server (${this.useSSL ? 'HTTPS' : 'HTTP'}) is running on port ${this.port}`, 'RPC');
            });

            // Catch any errors related to the server
            this.server.on('error', (err) => {
                if (err.code === 'EADDRINUSE' && retries < this.maxRetries) {
                    this.dnet.logger.error(`RPC server Port ${this.port} is already in use. Retrying in ${this.retryDelay / 1000} seconds...`, null, 'RPC');
                    retries++;
                    setTimeout(startServer, this.retryDelay);  // Retry after delay
                } else {
                    this.dnet.logger.error('Error starting server:', err, 'RPC');
                }
            });
        };

        // Start the server with retry logic
        startServer();
    }

    // Helper function to send JSON response
    sendJsonResponse(res, data, statusCode = 200) {
        try {
            res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
        } catch (err) {
            this.dnet.logger.log(`RPC json Response error: ${err}`, 'RPC');
        }
    }

    // Handle other RPC requests
    handleRPCRequests(req, res) {
        const { method, url: requestUrl } = req;

        if (method === 'POST' && requestUrl === '/') {
            let body = '';

            req.on('data', chunk => {
                body += chunk;
            });

            req.on('end', () => {
                try {
                    const message = JSON.parse(body);
                    if(!this.dnet.networkIdNames.get(message.networkId)) 
                        this.sendJsonResponse(res, { success: false, message: 'Invalid network id' });
                    else
                    {
                        // Call all message handlers for this networkId
                        this.messageHandlers.forEach(handler => {
                            handler.ReceivedRPCMessage(message, req, res);  // Pass the message to each handler
                        });
                    }
                } catch (err) {
                    this.dnet.logger.error('Error', err, 'RPC');
                    this.sendJsonResponse(res, { success: false, message: 'Invalid request body' });
                }
            });
        } else {
            this.sendJsonResponse(res, { success: false, message: 'Route not found' }, 404);
        }
    }

    // Handle URL-specific requests
    handleURLRequests(urlData) {
        this.messageHandlers.forEach(handler => {
            if (typeof handler.ReceivedURLMessage === 'function') {
                // Pass the object containing the data to the handler
                handler.ReceivedURLMessage(urlData);
            } else {
                this.dnet.logger.log(`Handler does not have the ReceivedURLMessage method.`, 'RPC');
                this.sendJsonResponse(res, { success: false, message: 'Handler does not support URL requests' }, 400);
            }
        });
    }

    // Strip the first segment from the URL and return the rest
    stripFirstSegment(requestUrl) {
        const path = requestUrl.split('?')[0];  // Remove query params if present
        const segments = path.split('/').filter(segment => segment.length > 0);  // Split by `/` and remove empty segments

        // If there are segments, remove the first one
        if (segments.length > 0) {
            segments.shift(); // Remove the first segment
        }

        // Rebuild the path without the first segment
        const newPath = `/${segments.join('/')}`;

        // Return the new URL (with the query parameters intact)
        const queryParams = requestUrl.split('?')[1] ? `?${requestUrl.split('?')[1]}` : '';
        return newPath + queryParams;
    }

    // Extract the networkId (first segment in the URL)
    extractNetworkId(requestUrl) {
        const segments = this.extractURLSegments(requestUrl);
        return segments.length > 0 ? segments[0] : null;
    }

    // Extract segments from the URL path
    extractURLSegments(requestUrl) {
        const path = requestUrl.split('?')[0];  // Remove query params if present
        const segments = path.split('/').filter(segment => segment.length > 0);  // Split by `/` and remove empty segments
        return segments;
    }

    // Check if the first segment of the URL ends with a slash
    hasValidSegmentWithSlash(requestUrl) {
        const path = requestUrl.split('?')[0];  // Remove query params if present
        const segments = path.split('/').filter(segment => segment.length > 0);  // Split by `/` and remove empty segments

        // For uniformity we make sure if there's only one segment that it ends with a slash
        return (segments.length > 1) || (segments.length == 1 && requestUrl.endsWith('/'));
    }

    // Placeholder for throttling logic (to be implemented)
    throttleRequests(req, res) {
        // For example, track requests per IP or per account to prevent spamming
        const ip = req.connection.remoteAddress;
        if (!this.requestCounts[ip]) {
            this.requestCounts[ip] = 0;
        }

        // Increment the request count for the IP
        this.requestCounts[ip]++;

        // If too many requests, throttle (placeholder logic)
        if (this.requestCounts[ip] > 200) {
            this.sendJsonResponse(res, { success: false, message: 'Rate limit exceeded' }, 429); // 429 Too Many Requests
            return true;
        }

        // Reset count after a time period (this would require a timeout function)
        setTimeout(() => {
            this.requestCounts[ip] = 0;
        }, 60000); // Reset count after 1 minute

        return false;
    }

    // Extract request handling logic to separate method
    requestHandler(req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            return res.end();
        }
        
        if(this.throttleRequests(req, res))
            return;

        req.originalRequestUrl = req.url;

        if (this.hasValidSegmentWithSlash(req.url)) {
            const urlData = {
                networkId: this.extractNetworkId(req.url),
                requestUrl: this.stripFirstSegment(req.url),
                req,
                res
            };
            this.handleURLRequests(urlData);
        } else {
            this.handleRPCRequests(req, res);
        }
    }
}

module.exports = RPC;
