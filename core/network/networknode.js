const Wallet = require('../wallet/wallet.js');
const Broadcaster = require('./broadcaster.js');
const crypto = require('crypto');
const path = require('path');
const Signer = require('../utils/signer.js');
const chalk = new (require('chalk')).Chalk();

class NetworkNode {
    constructor(networkId, dnetwork) {
        this.dnetwork = dnetwork;
        this.networkId = networkId;  // Store the networkId for this node

        this.nodeWallet = new Wallet(path.join(process.cwd(), 'wallets', 'node.json'));
        this.nodeId = this.nodeWallet.getPublicKeys()[0]; // Node ID used for ED25519 signing
        this.nodePrivateKey = this.nodeWallet.getAccounts()[0].privateKey;

        this.peerMessageHandlers = []; // Array to hold multiple peer message handlers
        this.rpcMessageHandlers = []; // Array to hold multiple RPC message handlers
        this.subscriptionServerMessageHandlers = []; // Array to hold multiple RPC message handlers
        this.urlMessageHandlers = []; // Array to hold multiple URL message handlers

        this.broadcaster = new Broadcaster(this);
    }

    Start() {
        if (this.peers)
        {
            this.peers.Start();
            this.peers.AddMessageHandler(this);
        }
        if(this.rpc)
        {
            this.rpc.Start();
            this.rpc.AddMessageHandler(this);
        }
        if(this.subscriptionServer)
        {
            this.subscriptionServer.Start();
        }
    }
    
    Stop() {
        // Remove the callback for logging from the logger
        if (this.dnetwork.logger && this.loggerCallback) {
            this.dnetwork.logger.removeCallback(this.loggerCallback);
        }

        // Stop the RPC and remove its message handler
        if (this.rpc) {
            this.rpc.RemoveMessageHandler(this);  // Assuming RemoveMessageHandler works like this
        }

        // Stop the peers and remove its message handler
        if (this.peers) {
            this.peers.RemoveMessageHandler(this);  // Assuming RemoveMessageHandler works like this
        }
        
        this.loggerCallback = null;
        this.peers = null;
        this.subscriptionServer = null;
        this.rpc = null;
    }

    // Set up communication
    SetRPC(rpc) {
        this.rpc = rpc; // HTTP hosting for controlling or outputs
    }

    SetPeers(peers) {
        this.peers = peers; // Direct P2P communication with other nodes
    }

    SetSubscriptionServer(subscriptionServer) {
        this.subscriptionServer = subscriptionServer; // Direct P2P communication with users for notifications
        // Store the callback reference in this.loggerCallback for cleanup later
        this.loggerCallback = (log) => { this.broadcaster.broadcastLog(log); };
        this.dnetwork.logger.addCallback(this.loggerCallback);
    }

    // Return communication channels
    GetRPC() {
        return this.rpc ? this.rpc : null;
    }

    GetPeers() {
        return this.peers ? this.peers : null;
    }

    GetSubscriptionServer() {
        return this.subscriptionServer ? this.subscriptionServer : null;
    }

    // Add a new peer message handler
    AddPeerMessageHandler(messageHandler) {
        this.peerMessageHandlers.push(messageHandler); // Add handler to the list
    }

    // Add a new RPC message handler
    AddRPCMessageHandler(messageHandler) {
        this.rpcMessageHandlers.push(messageHandler); // Add handler to the list
    }

    // Add a new URL message handler
    AddURLMessageHandler(messageHandler) {
        this.urlMessageHandlers.push(messageHandler); // Add handler to the list
    }

    // Pass on received peer message
    async ReceivedPeerMessage(message, socket) {
        // Check if the message's networkId matches the node's networkId
        if (message.networkId === this.networkId) {
            let gotHandled = false;
            // Call all message handlers for this networkId
            for (const handler of this.peerMessageHandlers) {
                gotHandled = await handler.handleMessage(message, socket);  // Pass the message to each handler
                if(gotHandled)
                    break;
            }

            /* --- We could give error replies to peer messages? But it's not needed at this point and saves in traffic.'
            if(!gotHandled)
            {
                this.sendMessage(socket, { xxx });
            }
            */
        } else {
            this.verbose(`Ignoring peer message for NetworkId ${message.networkId}. Not matching this network.`);
        }
    }

    // Pass on received RPC message
    async ReceivedRPCMessage(message, req, res) {
        // Check if the message's networkId matches the node's networkId
        if (message.networkId === this.networkId) {
            // Call all RPC message handlers for this networkId
            let gotHandled = false;
            for (const handler of this.rpcMessageHandlers) {
                if(!gotHandled)
                    gotHandled = await handler.handleMessage(message, req, res);
            }

            if(!gotHandled)
                this.SendRPCResponse(res, { success: false, message: 'Invalid action' }, 400);

        } else {
            this.verbose(`Ignoring RPC message for NetworkId ${message.networkId}. Not matching this network.`);
        }
    }

    async ReceivedURLMessage(request)
    {
        // Check if the URL's network id in the first segment of a url (/NETWORK1/) matches the node's networkId
        if (request.networkId === this.networkId) {
            // Call all RPC message handlers for this networkId
            for (const handler of this.urlMessageHandlers) {
                handler.handleMessage(request);
            }
        } else {
            this.verbose(`Ignoring RPC URL call for NetworkId ${request.networkId}. Not matching this network.`);
        }
    }

    sendToPeer(nodeId, message, callback = null) {
        const socket = this.peers.peerManager.connectedNodes.get(nodeId);
        if(socket)
        {
            this.sendMessage(socket, message, callback);
        }
    }
    sendAll(message, callback = null) {
        if(this.peers)
        {
            this.peers.peerManager.connectedPeers.forEach(socket => {
                this.sendMessage(socket, message, callback);  // Pass the message to each handler
            });
        }
    }
    // Sends messages to all peers
    sendMessage(socket, message, callback = null) {
        // Add a message ID for async callback
        const id = crypto.randomBytes(32).toString('hex');
        message.id = id;

        // Set the network id the message is intended for
        message.networkId = this.networkId;

        // Add nodeId (public key) to the message data
        message.nodeId = this.nodeId;

        // Convert message data to a JSON string
        message = JSON.stringify(message);

        // Sign the message
        this.signer = new Signer(this.nodePrivateKey);
        let signature = this.signer.signMessage(message);

        this.peers.sendMessage(socket, { message, signature, id }, callback);
    }
    // Helper function to send JSON response
    SendRPCResponse(res, data, statusCode = 200) {
        data.networkId = this.networkId;
        this.rpc.sendJsonResponse(res, data, statusCode = 200);
    }
    // Send a message to other networks
    sendOtherNetworks(message) {
        this.dnetwork.networks.forEach((network, networkId) => {
            // Exclude current network
            if(networkId != this.networkId)
            {
                this.peers.peerManager.connectedPeers.forEach(socket => {
                    message.networkId = networkId;
                    message.nodeId = this.nodeId;
                    message.sourceNetworkId = this.networkId;
                    message.data = message;

                    this.sendMessage(socket, message);  // Pass the message to each handler
                });
            }
        });
    }
    
    // Send a message to other networks
    // This is not a relay, this assumes we are part of both networks!
    sendTargetNetwork(targetNetworkId, message, callback) {
        for(const [networkId, network] of this.dnetwork.networks){
            if(network.node && network.node.GetPeers())
            {
                if(networkId == targetNetworkId)
                {
                    const peers = network.node.GetPeers();
                    peers.peerManager.connectedPeers.forEach(socket => {
                        // Add a message ID for async callback
                        const id = crypto.randomBytes(32).toString('hex');
                        message.id = id;

                        // Set the network id the message is intended for
                        message.networkId = targetNetworkId;

                        // Set the source network id the message is coming from
                        message.sourceNetworkId = this.networkId;

                        // Add nodeId (public key) to the message data
                        message.nodeId = this.nodeId;

                        // Convert message data to a JSON string
                        message = JSON.stringify(message);

                        // Sign the message
                        this.signer = new Signer(this.nodePrivateKey);
                        let signature = this.signer.signMessage(message);

                        peers.sendMessage(socket, { message, signature, id }, callback);
                    });

                    // We were part of the target network and broadcasted it to all peers
                    return true;
                }
            }
        }
        
        return false;
    }
    
    // For the case we are not in the target network
    // send a message to other networks through a relay node that's our peer
    // and part of the target network
    relayToTargetNetwork(targetNetworkId, message, callback) {
        const nodeRelay = this.peers.peerManager.canRelayToNetwork(targetNetworkId);
        if(!nodeRelay)
            return false; // Relaying is not possible, no peer is in the target network
        
        // Get the socket of the peer that's in the target network
        const socket = this.peers.peerManager.connectedNodes.get(nodeRelay);
        
        // Add a message ID for async callback
        const id = crypto.randomBytes(32).toString('hex');
        message.id = id;

        // Set the network id the message is intended for
        message.networkId = targetNetworkId;

        // Set the source network id the message is coming from
        message.sourceNetworkId = this.networkId;
        
        // Add nodeId (public key) to the message data
        message.nodeId = this.nodeId;

        // Convert message data to a JSON string
        message = JSON.stringify(message);

        // Sign the message
        this.signer = new Signer(this.nodePrivateKey);
        let signature = this.signer.signMessage(message);

        this.peers.sendMessage(socket, { message, signature, id }, callback);
        
        // Relay was successful
        return true;
    }

    // Broadcast message to users subscribed to topics
    sendSubscriberMessage(topic, content) {
        if (!this.subscriptionServer)
            return;

        content.networkId = this.networkId;
        this.subscriptionServer.broadcastMessageToTopic(topic, content);
    }

    // Passing the logs
    log(msg)
    {
        const webName = this.dnetwork.networkIdWebNames.get(this.networkId);
        const networkName = this.dnetwork.networkIdNames.get(this.networkId);
        this.dnetwork.logger.log(`(${networkName}) ${msg}`, webName, this.networkId);
    }
    error(msg, err)
    {
        const webName = this.dnetwork.networkIdWebNames.get(this.networkId);
        const networkName = this.dnetwork.networkIdNames.get(this.networkId);
        this.dnetwork.logger.error(`(${networkName}) ${msg}`, err, webName, this.networkId);
    }
    warn(msg)
    {
        const webName = this.dnetwork.networkIdWebNames.get(this.networkId);
        const networkName = this.dnetwork.networkIdNames.get(this.networkId);
        this.dnetwork.logger.warn(`(${networkName}) ${msg}`, webName, this.networkId);
    }
    info(msg)
    {
        const webName = this.dnetwork.networkIdWebNames.get(this.networkId);
        const networkName = this.dnetwork.networkIdNames.get(this.networkId);
        this.dnetwork.logger.info(`(${networkName}) ${msg}`, webName, this.networkId);
    }
    verbose(msg)
    {
        const webName = this.dnetwork.networkIdWebNames.get(this.networkId);
        const networkName = this.dnetwork.networkIdNames.get(this.networkId);
        this.dnetwork.logger.verbose(`(${networkName}) ${msg}`, webName, this.networkId);
    }
}

module.exports = NetworkNode;
