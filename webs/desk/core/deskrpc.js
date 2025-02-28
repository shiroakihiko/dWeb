const fs = require('fs');
const path = require('path');
const ConfigHandler = require('../../../core/utils/confighandler.js');

class DeskRPC {
    constructor(options)
    {
    }

    // Request Binding
    bindToNode(node)
    {
        this.node = node;
        node.AddRPCMessageHandler(this);
        node.log('Desk Provider RPC Listener Running..');
    }
    
    // Handling messages
    handleMessage(message, req, res) {
        try {
            const method = message.method;

            // Handle actions based on 'action' field in the JSON body
            switch (method) {
                case 'getAvailableNetworks':
                    return this.getAvailableNetworks(res);
                case 'getAllNetworks':  // New action to fetch all networks
                    return this.getAllNetworks(res);
                case 'getAllLogs':  // Fetch all logs
                    return this.getAllLogs(res);
                case 'getNetworkLogs':  // Fetch network-specific logs
                    return this.getNetworkLogs(res, message.targetNetworkId);
                case 'createNetwork':  // Handle creating a new network
                    return this.createNetwork(res, message.networkConfig);
                case 'deleteNetwork':  // Fetch network-specific logs
                    return this.deleteNetwork(res, message.targetNetworkId);
                case 'checkOperatorStatus':
                    return this.checkOperatorStatus(res, message.publicKey);
                case 'getAllWebModuleContent':
                    return this.getAllWebModuleContent(res, message.modules);
                default:
                    return this.node.SendRPCResponse(res, { success: false, message: 'Invalid action' }, 400);
            }
        } catch (err) {
            this.node.SendRPCResponse(res, { success: false, message: 'Invalid request body' });
        }
    }

    // Method to create a network
    async createNetwork(res, setupConfig) {
        try {
            const availableWebModules = ConfigHandler.getAllWebs();
            if(!availableWebModules.includes(setupConfig.webName)) {
                return this.node.SendRPCResponse(res, { success: false, message: 'Invalid web module specified.' }, 400);
            }
                
            const web = ConfigHandler.getNetwork(setupConfig.webName, setupConfig.networkName);
            if (ConfigHandler.getNetwork(setupConfig.webName, setupConfig.networkName)) {
                return this.node.SendRPCResponse(res, { success: false, message: 'Network already exists.' }, 400);
            }
            
            const networkConfig = {
                networkName: setupConfig.networkName,
                peerPort: parseInt(setupConfig.peerPort),
                rpcPort: parseInt(setupConfig.rpcPort),
                subscriptionPort: parseInt(setupConfig.subscriptionPort),
                peers: setupConfig.peers,
                dbPath: 'data/'+setupConfig.networkName
            };

            // Add the new network
            ConfigHandler.addNetwork(setupConfig.webName, setupConfig.networkName, networkConfig);
            this.node.dnetwork.startNetwork(setupConfig.webName, setupConfig.networkName, networkConfig);
            return this.node.SendRPCResponse(res, { success: true, message: 'Network created successfully' });
        } catch (error) {
            this.node.error('Error creating network:', error);
            return this.node.SendRPCResponse(res, { success: false, message: 'Failed to create network' });
        }
    }
    
    // Method to join an existing network
    async joinNetwork(res, networkConfig) {
        try {
            const existingNetwork = ConfigHandler.getNetwork(networkConfig.networkId);
            if (!existingNetwork) {
                return this.node.SendRPCResponse(res, { success: false, message: 'Network not found' }, 404);
            }

            // Assuming there is a method to add the peer to an existing network
            const network = this.node.dnetwork.networks.get(networkConfig.networkId);
            network.addPeer(networkConfig);

            return this.node.SendRPCResponse(res, { success: true, message: 'Successfully joined the network' });
        } catch (error) {
            this.node.error('Error joining network:', error);
            return this.node.SendRPCResponse(res, { success: false, message: 'Failed to join network' });
        }
    }

    // Method to delete a network
    async deleteNetwork(res, networkId) {
        try {
            const network = ConfigHandler.getNetworkById(networkId);
            if (!network) {
                return this.node.SendRPCResponse(res, { success: false, message: 'Network not found' }, 404);
            }

            // Shut down any running network
            const stoppedNetwork = await this.node.dnetwork.stopNetwork(networkId);
            if(stoppedNetwork)
            {
                // Remove the networks config entry
                ConfigHandler.removeNetworkById(networkId);
                return this.node.SendRPCResponse(res, { success: true, message: 'Network deleted successfully' });
            }
            else
            {
                return this.node.SendRPCResponse(res, { success: false, message: 'Failed to delete network' });
            }
        } catch (error) {
            this.node.error('Error deleting network:', error);
            return this.node.SendRPCResponse(res, { success: false, message: 'Failed to delete network' });
        }
    }

    // Fetch all logs from the logger
    async getAllLogs(res) {
        try {
            const logs = this.node.dnetwork.logger.getAllLogs(); // Assuming a method that returns all logs
            this.node.SendRPCResponse(res, { success: true, logs });
        } catch (error) {
            this.node.error('Error fetching logs:', error);
            this.node.SendRPCResponse(res, { success: false, message: 'Failed to fetch logs' });
        }
    }

    // Fetch network-specific logs
    async getNetworkLogs(res, networkId) {
        try {
            const logs = this.node.dnetwork.logger.getNetworkLogs(networkId); // Assuming a method that returns logs for a specific network
            this.node.SendRPCResponse(res, { success: true, logs });
        } catch (error) {
            this.node.error(`Error fetching logs for network ${networkId}:`, error);
            this.node.SendRPCResponse(res, { success: false, message: `Failed to fetch logs for network ${networkId}` });
        }
    }

    // Get available networks
    async getAvailableNetworks(res) {
        const networkDetails = {};
        
        const networks = this.node.dnetwork.activeNetworkIDs();
        for (let networkId in networks) {
            const networkNode = this.node.dnetwork.network_nodes.get(networkId);
            if(networkNode)
            {
                let activeNetworkPeers = [];
                activeNetworkPeers.push(this.node.nodeId);
                if(networkNode.peers && networkNode.peers.peerManager.connectedNodes)
                    activeNetworkPeers = activeNetworkPeers.concat(Array.from(networkNode.peers.peerManager.connectedNodes.keys()));
                
                
                let network = this.node.dnetwork.networks.get(networkId);
                let delegators = [];
                if(network.ledger)
                {
                    const networkValidators = network.ledger.getNetworkValidatorWeights();
                    if(networkValidators)
                    {
                        for (const delegatorNodeId in networkValidators)
                        {
                            delegators.push(delegatorNodeId);
                        }
                    }
                }
                
                let subscriptionPort = null;
                if(network.node.GetSubscriptionServer())
                    subscriptionPort = network.node.GetSubscriptionServer().port;
                
                let rpcPort = null;
                if(network.node.GetRPC())
                    rpcPort = network.node.GetRPC().port;
                
                // Add additional details to each network
                networkDetails[networkId] = {
                    id: networkId, 
                    name: networks[networkId],
                    activeNetworkPeers: activeNetworkPeers,
                    delegators: delegators,
                    rpcPort: rpcPort,
                    subscriptionPort: subscriptionPort
                };
            }
        }

        this.node.SendRPCResponse(res, { success: true, networks: networkDetails });
    }
    // Get all networks from all webs with connected peers and subscribers info
    async getAllNetworks(res) {
        const allNetworks = ConfigHandler.getAllNetworks();
        const networkDetails = [];

        // For each network, fetch connected peers and subscribers
        for (let networkConfig of allNetworks) {
            const networkId = networkConfig.networkId;
            const networkNode = this.node.dnetwork.network_nodes.get(networkId);
            if(networkNode)
            {
                // Fetch connected peers count (from network_nodes)
                let connectedPeersCount = 0;
                if(networkNode.peers)
                    connectedPeersCount = networkNode.peers.peerManager.connectedPeers.size;

                // Fetch connected subscribers count (from network_subscriptionservers)
                let connectedSubscribersCount = 0;
                if(networkNode.subscriptionServer)
                    connectedSubscribersCount = networkNode.subscriptionServer.users.size;

                let activeNetworkPeers = [];
                activeNetworkPeers.push(this.node.nodeId);
                if(networkNode.peers && networkNode.peers.peerManager.connectedNodes)
                    activeNetworkPeers = activeNetworkPeers.concat(Array.from(networkNode.peers.peerManager.connectedNodes.keys()));

                const network = this.node.dnetwork.networks.get(networkId);
                const networkWeights = network.ledger ? network.ledger.getNetworkValidatorWeights() : {};
                
                // Add additional details to each network
                networkDetails.push({
                    ...networkConfig,
                    connectedPeersCount,
                    connectedSubscribersCount,
                    activeNetworkPeers,
                    networkWeights
                });
            }
        }

        this.node.SendRPCResponse(res, { success: true, networks: networkDetails });
    }

    // Check if a public key is the node operator
    async checkOperatorStatus(res, publicKey) {
        this.node.SendRPCResponse(res, { success: true, isOperator: this.node.nodeId == publicKey });
    }   

    async getAllWebModuleContent(res, modules = []) {
        const webModules = {};

        for (let file of modules) {
            const publicPath = path.join(__dirname, '../public');
            try {
                if(fs.existsSync(path.join(publicPath, file+'.html')))
                {
                    const content = fs.readFileSync(path.join(publicPath, file+'.html'), 'utf8');
                    webModules[file] = content;
                }
            } catch (err) {
                console.error(`Error reading ${file}:`, err);
            }
            
        }
        
        this.node.SendRPCResponse(res, { success: true, modules: webModules });
    }
}

module.exports = DeskRPC;

