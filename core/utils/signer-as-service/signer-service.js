const cluster = require('cluster');
const os = require('os');
const net = require('net');
const ed = require('@noble/ed25519');
const { exec } = require('child_process');

const PORT = 31337;

// Force kill any process using our port
async function cleanupPort() {
    return new Promise((resolve) => {
        exec(`fuser -k ${PORT}/tcp`, (error) => {
            // Give OS time to release port
            setTimeout(resolve, 1000);
        });
    });
}

if (cluster.isPrimary) {
    // Primary process - setup server and manage workers
    const numWorkers = Math.max(2, os.cpus().length);
    const maxTasksPerWorker = 4000;
    const workerPool = new Map();
    const requestSocketMap = new Map();
    let currentWorker = 0;
    let isShuttingDown = false;
    let server = null;

    // Track worker state
    const workerStats = new Map();
    const workerLoads = new Map();
    
    function updateWorkerStats(workerId, stats) {
        workerStats.set(workerId, {
            ...workerStats.get(workerId) || {},
            ...stats,
            lastUpdate: Date.now()
        });
    }

    function getNextWorker() {
        // Simple round-robin for speed
        const workers = Array.from(workerPool.values());
        if (workers.length === 0) return null;
        
        const worker = workers[currentWorker];
        currentWorker = (currentWorker + 1) % workers.length;
        return worker;
    }

    function updateWorkerLoad(workerId, increment = true) {
        const currentLoad = workerLoads.get(workerId) || 0;
        workerLoads.set(workerId, increment ? currentLoad + 1 : Math.max(0, currentLoad - 1));
    }

    // Monitor workers periodically
    setInterval(() => {
        const totalTasks = Array.from(workerStats.values())
            .reduce((sum, stats) => sum + (stats.tasksCompleted || 0), 0);
        const activeWorkers = workerPool.size;
        
        console.log(`Signer Status: ${activeWorkers} workers, ${totalTasks} tasks completed`);
        
        // Only log errors if they exist
        for (const [id, stats] of workerStats.entries()) {
            if (stats.error) {
                console.error(`Worker ${id} error:`, stats.error);
            }
        }
    }, 30000); // Reduced from 5000 to 30000

    // Track responses and sockets together
    const socketResponses = new Map();

    function getSocketResponses(socket) {
        if (!socketResponses.has(socket)) {
            socketResponses.set(socket, {
                pending: new Map(),
                lastProcessed: 0,
                socket,
                requests: new Map(),
                lastCleanup: Date.now()
            });
        }
        return socketResponses.get(socket);
    }

    function cleanupOldRequests(state) {
        const now = Date.now();
        if (now - state.lastCleanup < 1000) return; // Only cleanup every second

        const { requests, pending } = state;

        // Clean up old pending responses
        const oldPendingIds = Array.from(pending.keys())
            .filter(id => {
                // Remove responses that:
                // 1. Are older than lastProcessed
                // 2. Have no matching request
                // 3. Are older than 30 seconds
                const response = pending.get(id);
                return id <= state.lastProcessed || 
                       !requests.has(id) ||
                       (response.timestamp && now - response.timestamp > 30000);
            });

        if (oldPendingIds.length > 0) {
            console.debug(`Cleaning up ${oldPendingIds.length} old pending responses:`, oldPendingIds);
            oldPendingIds.forEach(id => pending.delete(id));
        }

        // Clean up old requests
        const oldRequestIds = Array.from(requests.keys())
            .filter(id => {
                const request = requests.get(id);
                return id <= state.lastProcessed || 
                       (request.timestamp && now - request.timestamp > 30000);
            });

        if (oldRequestIds.length > 0) {
            console.debug(`Cleaning up ${oldRequestIds.length} old requests:`, oldRequestIds);
            oldRequestIds.forEach(id => requests.delete(id));
        }

        state.lastCleanup = now;
    }

    function sendOrderedResponses(socket) {
        const state = getSocketResponses(socket);
        const { pending, lastProcessed, requests } = state;

        // Clean up old requests first
        cleanupOldRequests(state);

        // Process responses in order
        const pendingIds = Array.from(pending.keys())
            .filter(id => id !== undefined && id !== null && id > lastProcessed)
            .sort((a, b) => a - b);
        
        // Log state for debugging
        if (pending.size > 0 || requests.size > 0) {
            console.debug('Current response state:', {
                socket: socket.remoteAddress,
                pendingCount: pending.size,
                requestCount: requests.size,
                lastProcessed,
                pendingIds,
                requestIds: Array.from(requests.keys()).sort((a, b) => a - b),
                oldestPendingAge: pending.size > 0 ? 
                    Math.min(...Array.from(pending.values())
                        .map(r => Date.now() - r.timestamp)) : 0,
                oldestRequestAge: requests.size > 0 ?
                    Math.min(...Array.from(requests.values())
                        .map(r => Date.now() - r.timestamp)) : 0
            });
        }

        for (const id of pendingIds) {
            const response = pending.get(id);
            const request = requests.get(id);
            
            if (!response || !request) {
                console.warn(`Missing response or request for id ${id}, cleaning up`);
                pending.delete(id);
                requests.delete(id);
                continue;
            }

            try {
                if (!socket.destroyed) {
                    socket.write(JSON.stringify({
                        id,
                        result: response.result,
                        error: response.error
                    }) + '\n');
                    
                    console.debug(`Sent response ${id} for ${request.type} request`);
                    pending.delete(id);
                    requests.delete(id);
                    state.lastProcessed = id;
                }
            } catch (err) {
                console.error(`Failed to send response ${id}:`, err);
                break;
            }
        }
    }

    function handleWorkerResponse(response, socket) {
        if (!socket?.writable) return;
        
        try {
            socket.write(JSON.stringify(response) + '\n');
        } catch (err) {
            console.error(`Failed to send response ${response.id}:`, err);
        }
    }

    // Optimize server handling
    server = net.createServer((socket) => {
        socket.setNoDelay(true);
        socket.setKeepAlive(true, 60000);
        let buffer = '';
        let messageQueue = [];
        let processingQueue = false;

        async function processMessageQueue() {
            if (processingQueue || messageQueue.length === 0) return;
            processingQueue = true;

            const CHUNK_SIZE = 200; // Up from 100
            const chunk = messageQueue.splice(0, CHUNK_SIZE);

            try {
                await Promise.all(chunk.map(async (msg) => {
                    if (!msg.trim()) return;
                    
                    try {
                        const request = JSON.parse(msg);
                        const worker = getNextWorker();
                        
                        if (worker) {
                            requestSocketMap.set(request.id, socket);
                            worker.send(request);
                        } else {
                            socket.write(JSON.stringify({
                                id: request.id,
                                error: 'No workers available'
                            }) + '\n');
                        }
                    } catch (err) {
                        console.error('Error processing request:', err);
                    }
                }));
            } finally {
                processingQueue = false;
                if (messageQueue.length > 0) {
                    setImmediate(processMessageQueue);
                }
            }
        }

        socket.on('data', (data) => {
            buffer += data.toString();
            const messages = buffer.split('\n');
            buffer = messages.pop();

            if (messages.length > 0) {
                messageQueue.push(...messages);
                setImmediate(processMessageQueue);
            }
        });

        socket.on('close', () => {
            // Fast cleanup
            const idsToDelete = [];
            for (const [id, sock] of requestSocketMap.entries()) {
                if (sock === socket) idsToDelete.push(id);
            }
            idsToDelete.forEach(id => requestSocketMap.delete(id));
        });
    });

    // Optimize worker message handling
    function setupWorker(worker) {
        const pendingResponses = new Set();

        worker.on('message', (msg) => {
            if (msg.type === 'stats') return;

            if (msg.id !== undefined) {
                const socket = requestSocketMap.get(msg.id);
                if (socket?.writable) {
                    try {
                        socket.write(JSON.stringify(msg) + '\n');
                    } catch (err) {
                        console.error(`Failed to send response ${msg.id}:`, err);
                    }
                }
                requestSocketMap.delete(msg.id);
                pendingResponses.delete(msg.id);
            }
        });

        // Monitor worker health
        worker.on('error', (err) => {
            console.error(`Worker ${worker.id} error:`, err);
            workerPool.delete(worker.id);
            createWorker();
        });

        return worker;
    }

    // Modify batch work distribution
    async function distributeBatchWork(request, socket) {
        const { batch } = request;
        const { messages, signatures, publicKeys } = batch;
        
        // Create larger optimal chunk size
        const chunkSize = Math.max(200, Math.ceil(messages.length / workerPool.size));
        const chunks = [];
        
        for (let i = 0; i < messages.length; i += chunkSize) {
            const end = Math.min(i + chunkSize, messages.length);
            chunks.push({
                messages: messages.slice(i, end),
                signatures: signatures.slice(i, end),
                publicKeys: publicKeys.slice(i, end),
                startIndex: i
            });
        }

        const results = new Array(messages.length);
        const errors = [];

        // Process chunks with retries
        await Promise.all(chunks.map(async chunk => {
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const worker = getNextWorker();
                    if (!worker) throw new Error('No workers available');

                    updateWorkerLoad(worker.id, true);
                    
                    const response = await processRequest({
                        id: `${request.id}_${chunk.startIndex}`,
                        type: 'batchVerify',
                        batch: chunk
                    }, socket);

                    response.result.forEach((result, idx) => {
                        results[chunk.startIndex + idx] = result;
                    });

                    updateWorkerLoad(worker.id, false);
                    break; // Success, exit retry loop
                } catch (err) {
                    if (attempt === 2) { // Last attempt
                        errors.push(`Chunk ${chunk.startIndex}: ${err.message}`);
                    } else {
                        await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay before retry
                    }
                }
            }
        }));

        if (errors.length > 0) {
            throw new Error(`Batch verification failed: ${errors.join(', ')}`);
        }

        return results;
    }

    // Start server
    async function startServer(retries = 3) {
        if (retries <= 0) {
            console.error('Failed to start server after maximum retries');
            process.exit(1);
        }

        try {
            await cleanupPort();
            
            server.listen(PORT, '127.0.0.1', () => {
                console.log(`Signer service started on port ${PORT} with ${numWorkers} workers`);
                startWorkers();
            });

            server.on('error', async (err) => {
                console.error('Server error:', err);
                if (err.code === 'EADDRINUSE') {
                    console.log('Address in use, retrying...');
                    server.close();
                    await cleanupPort();
                    setTimeout(() => startServer(retries - 1), 1000);
                }
            });
        } catch (err) {
            console.error('Error starting server:', err);
            setTimeout(() => startServer(retries - 1), 1000);
        }
    }

    function createWorker() {
        if (isShuttingDown) return null;

        const worker = cluster.fork();
        
        worker.on('error', (err) => {
            console.error(`Worker ${worker.id} error:`, err);
            updateWorkerStats(worker.id, { 
                error: err.message,
                errorTime: Date.now()
            });
            if (workerPool.has(worker.id)) {
                workerPool.delete(worker.id);
                if (!isShuttingDown) {
                    createWorker();
                }
            }
        });

        worker.on('message', (msg) => {
            if (msg.type === 'stats') {
                updateWorkerStats(worker.id, msg.stats);
                return;
            }

            if (msg.id !== undefined) {
                const socket = requestSocketMap.get(msg.id);
                if (socket && !socket.destroyed) {
                    try {
                        socket.write(JSON.stringify(msg) + '\n');
                    } catch (err) {
                        console.error(`Failed to send response ${msg.id}:`, err);
                    }
                }
                requestSocketMap.delete(msg.id);
            }
        });

        workerPool.set(worker.id, worker);
        return worker;
    }

    function startWorkers() {
        for (let i = 0; i < numWorkers; i++) {
            createWorker();
        }
    }

    // Graceful shutdown
    async function shutdown() {
        if (isShuttingDown) return;
        isShuttingDown = true;
        
        console.log('Shutting down...');
        
        // Stop accepting new connections
        if (server) {
            server.close();
        }

        // Give active requests a chance to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Terminate all workers
        for (const worker of workerPool.values()) {
            try {
                worker.disconnect();
                // Force kill after timeout
                setTimeout(() => {
                    try {
                        worker.kill();
                    } catch (err) {
                        console.error(`Error killing worker ${worker.id}:`, err);
                    }
                }, 500);
            } catch (err) {
                console.error(`Error disconnecting worker ${worker.id}:`, err);
                try {
                    worker.kill();
                } catch (killErr) {
                    console.error(`Error killing worker ${worker.id}:`, killErr);
                }
            }
        }

        // Final cleanup
        await cleanupPort();
        process.exit(0);
    }

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Start everything
    startServer();

    // Add periodic cleanup of old request mappings
    setInterval(() => {
        const now = Date.now();
        for (const [requestId, socket] of requestSocketMap) {
            if (socket.destroyed) {
                requestSocketMap.delete(requestId);
                continue;
            }

            const socketState = getSocketResponses(socket);
            if (!socketState || !socketState.requests.has(requestId)) {
                requestSocketMap.delete(requestId);
            }
        }
    }, 5000);

} else {
    // Worker process
    let currentTask = null;
    let tasksCompleted = 0;
    let lastError = null;

    // Report stats periodically
    setInterval(() => {
        if (process.connected) {
            process.send({
                type: 'stats',
                stats: {
                    tasksCompleted,
                    lastError
                }
            });
        }
    }, 10000); // Reduced from 1000 to 10000

    process.on('message', async (request) => {
        if (!process.connected) return;

        try {
            const { id, type, message, signature, publicKey, privateKey, batch } = request;
            let result;

            switch (type) {
                case 'sign': {
                    result = await ed.signAsync(
                        Buffer.from(message),
                        Buffer.from(privateKey, 'hex')
                    );
                    result = Buffer.from(result).toString('base64');
                    break;
                }
                case 'verify': {
                    result = await ed.verifyAsync(
                        Buffer.from(signature, 'base64'),
                        Buffer.from(message),
                        Buffer.from(publicKey, 'hex')
                    );
                    break;
                }
                case 'batchVerify': {
                    const { messages, signatures, publicKeys } = batch;
                    result = await Promise.all(messages.map((msg, i) => 
                        ed.verifyAsync(
                            Buffer.from(signatures[i], 'base64'),
                            Buffer.from(msg),
                            Buffer.from(publicKeys[i], 'hex')
                        )
                    ));
                    break;
                }
            }

            tasksCompleted++;
            
            if (process.connected) {
                process.send({ id, result, error: null });
            }

        } catch (error) {
            lastError = {
                message: error.message,
                time: Date.now()
            };
            
            if (process.connected) {
                process.send({
                    id: request.id,
                    result: null,
                    error: error.message
                });
            }
        }
    });

    process.on('disconnect', () => {
        process.exit(0);
    });
} 