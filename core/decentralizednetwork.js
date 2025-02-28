const path = require('path');
const fs = require('fs');
const NetworkNode = require('./network/networknode.js');
const Peers = require('./network/channels/peers.js');
const RPC = require('./network/channels/rpc.js');
const SubscriptionServer = require('./network/channels/subscriptionserver.js');
const Telemetry = require('./network/telemetry.js');
const ConfigHandler = require('./utils/confighandler.js');
// Default Message Handlers
const PeerMessageHandler = require('./network/messagehandlers/peer-message-handler.js');
const RPCMessageHandler = require('./network/messagehandlers/rpc-message-handler.js');
const Logger = require('./logger/logger.js');
const Hasher = require('./utils/hasher.js');

class DecentralizedNetwork {
    constructor() {
        this.networks = new Map(); // Map of networks
        this.network_nodes = new Map(); // Map of network nodes
        this.network_subscriptionservers = new Map(); // Map of network subscription servers
        this.networkIdWebNames = new Map(); // Map of network IDs to their corresponding web module name
        this.networkIdNames = new Map(); // Map of network IDs to their corresponding network name
        this.PortPeers = new Map(); // Map of peer channels by port
        this.PortRPC = new Map(); // Map of RPC channels by port
        this.PortSubscription = new Map(); // Map of Subscription instances by port
        this.logger = new Logger();

        // Telemetry instance, should be initialized right away.
        this.telemetry = new Telemetry(this);
        this.telemetry.initialize();

        // Start periodic network updates
        this.timerNetworkStats = null;
        this.timerNetworkUpdates = null;
        this.startNetworkUpdates();
        this.showNetworkStats();
    }

    async initialize(callback) {
        await Hasher.initialize();
        callback();
    }

    // Add a web module and its networks
    // networkId is optional and can be random but must be specified for cross-network communication
    add(webName) {
        const webPath = path.join(process.cwd(), 'webs', webName, `${webName}.js`);
        const networks = ConfigHandler.getNetworks(webName);
        if (!fs.existsSync(webPath)) {
            this.logger.warn(`Web module ${webName} specified in config but not found in webs folder.`);
            return false;
        }
        if(!networks)
        {
            this.logger.warn(`Web module ${webName} has no networks specified.`);
            return false;
        }

        // Iterate over the networks using for...of instead of forEach
        for (const [networkName, networkConfig] of Object.entries(networks)) {
            this.startNetwork(webName, networkName, networkConfig);
        }
    }
    
    async startNetwork(webName, networkName, networkConfig)
    {
        const webPath = path.join(process.cwd(), 'webs', webName, `${webName}.js`);
        const webModule = require(webPath);
        const network = new webModule(networkConfig);
        await network.initialize();
        network.webName = webName;

        if (!networkConfig.networkId) {
            const initOptions = {...networkConfig};
            initOptions.webName = webName;

            if (typeof network.createNetwork === 'function') {
                let networkId = await network.createNetwork(initOptions);

                if (networkId) {
                    // Update config with the newly created network
                    networkConfig.networkId = networkId;
                    ConfigHandler.setNetworkConfig(webName, networkName, networkConfig);
                } else {
                    this.logger.warn(`Could not create network for web module ${webName}`);
                }
            }
            else
                this.logger.warn(`Could not create network for web module ${webName}`);
        }

        if (networkConfig.networkId) {
            network.networkId = networkConfig.networkId;
            const node = new NetworkNode(network.networkId, this);
            await node.initialize();
            // Setting the network's RPC and Peer
            if (networkConfig.rpcPort) {
                const rpc = this.initializeRPC(webName, network.networkId, networkConfig);
                node.SetRPC(rpc);
                node.AddRPCMessageHandler(new RPCMessageHandler(network));
            }
            if (networkConfig.peerPort) {
                const peers = this.initializePeers(webName, network.networkId, networkConfig);
                node.SetPeers(peers);
                node.AddPeerMessageHandler(new PeerMessageHandler(network));
            }
            if(networkConfig.subscriptionPort) {
                const subscriptionServer = this.initializeSubscriptionServer(webName, network.networkId, networkConfig);
                node.SetSubscriptionServer(subscriptionServer);
            }

            // Storing nodes and networks
            this.network_nodes.set(network.networkId, node);
            this.network_subscriptionservers.set(network.networkId, node);
            this.networks.set(network.networkId, network);
            this.networkIdWebNames.set(network.networkId, webName);
            this.networkIdNames.set(network.networkId, networkName);


            // Start the network
            network.Start(node);

            // Start the node
            node.Start();

            this.logger.log(`Added web module: ${webName} for network ${networkName} (${network.networkId})`);
        }
    }

    // Initialize RPC instance for a specific network
    initializeRPC(webName, networkId, config) {
        // Create and return a new RPC instance using the network's config or defaults
        const rpcPort = config.rpcPort;
        const mainConfig = ConfigHandler.getMainConfig();
        const certPath = path.join(path.join(__dirname, '../'), 'certs');

        // Use an existing instance if it already exists on that port
        const existingInstance = this.PortRPC.get(rpcPort);
        if(existingInstance)
        {
            this.logger.log(`attached to existing RPC instance (port ${rpcPort}) for network: ${networkId}`, webName, networkId);
            return existingInstance;
        }

        this.logger.log(`created new RPC instance (port ${rpcPort}) for network: ${networkId}`, webName, networkId);
        const newInstance = new RPC(this, { RPCPort: rpcPort, useSSL: mainConfig.useSSL, certPath: certPath });
        this.PortRPC.set(rpcPort, newInstance);
        return newInstance;
    }

    // Initialize Peers instance for a specific network
    initializePeers(webName, networkId, config) {
        // Create and return a new Peers instance using the network's config or defaults
        const peerPort = config.peerPort;

        // Use an existing instance if it already exists on that port
        const existingInstance = this.PortPeers.get(peerPort);
        if(existingInstance)
        {
            this.logger.log(`attached to existing peers instance (port ${peerPort}) for network: ${networkId}`, webName, networkId);
            existingInstance.addPeers(networkId, config.peers);
            return existingInstance;
        }

        this.logger.log(`created new peers instance (port ${peerPort}) for network: ${networkId}`, webName, networkId);
        const newInstance = new Peers(this, { peerPort: peerPort });
        newInstance.AddMessageHandler(this.telemetry);
        newInstance.addPeers(networkId, config.peers);
        this.PortPeers.set(peerPort, newInstance);
        return newInstance;
    }

    // Initialize SubscriptionServer instance for a specific network
    initializeSubscriptionServer(webName, networkId, config) {
        // Create and return a new SubscriptionServer instance using the network's config or defaults
        const subscriptionPort = config.subscriptionPort;
        const mainConfig = ConfigHandler.getMainConfig();
        const certPath = path.join(path.join(__dirname, '../'), 'certs');

        // Use an existing instance if it already exists on that port
        const existingInstance = this.PortSubscription.get(subscriptionPort);
        if(existingInstance)
        {
            this.logger.log(`attached to existing subscription server instance (port ${subscriptionPort}) for network: ${networkId}`, webName, networkId);
            return existingInstance;
        }

        this.logger.log(`created new subscription server instance (port ${subscriptionPort}) for network: ${networkId}`, webName, networkId);
        const newInstance = new SubscriptionServer(this, { port: subscriptionPort, useSSL: mainConfig.useSSL, certPath: certPath });
        this.PortSubscription.set(subscriptionPort, newInstance);
        return newInstance;
    }

    showNetworkStats() {
        this.timerNetworkStats = setInterval(() => {
            for(const network of this.networks.values()) {
                const networkName = this.networkIdNames.get(network.networkId);
                const webName = this.networkIdWebNames.get(network.networkId);

                if(network.ledger) {
                    this.logger.log(`(${networkName}) Last Block: ${network.ledger.getLastBlockHash()} - Total Blocks: ${network.ledger.getTotalBlockCount()} - Total Actions: ${network.ledger.getTotalActionCount()} - Accounts: ${network.ledger.getTotalAccountCount()} - Pending Actions: ${network.consensus.pendingActionManager.getPendingActionCount()}`, webName, network.networkId);
                }
            }
        }, 30000); // Send a network update every minute
    }

    // Periodically update the network stats
    startNetworkUpdates() {
        this.timerNetworkUpdates = setInterval(() => {
            if(!this.networks.size)
                return;

            for(const network of this.networks.values()) {
                if (network.ledger) {
                    network.sendNetworkUpdates();
                }
            }
        }, 60000); // Send a network update every minute
    }


    // Get a list of all active network IDs
    activeNetworkIDs() {
        const activeNetworks = {};
        this.networks.forEach((network, networkId) => {
            activeNetworks[networkId] = {networkName: this.networkIdNames.get(networkId), webName: this.networkIdWebNames.get(networkId)};
        });
        return activeNetworks;
    }

    async stop() {
        for(const network of this.networks.values()) {
            await this.stopNetwork(network.networkId);
        }
        clearInterval(this.timerNetworkStats);
        clearInterval(this.timerNetworkUpdates);
    }

    // Function to stop a network by its ID
    async stopNetwork(networkId) {
        // Check if the network exists
        if (!this.networks.has(networkId)) {
            this.logger.warn(`Network with ID ${networkId} does not exist.`);
            return false;
        }

        // Retrieve the network and related node
        const network = this.networks.get(networkId);
        const node = network.node ? network.node : null;

        // Stop the network and node
        if (node) {
            node.Stop();
            this.logger.log(`Stopped node for network ${networkId}`);
        }

        if (network) {
            if(network.Stop)
                network.Stop();
            this.logger.log(`Stopped network ${networkId}`);
        }

        // Remove network from all maps
        this.networks.delete(networkId);
        this.network_nodes.delete(networkId);
        this.network_subscriptionservers.delete(networkId);
        this.networkIdWebNames.delete(networkId);
        this.networkIdNames.delete(networkId);

        // Cleanup services (RPC, Peers, SubscriptionServer) if not in use by other networks
        await this.cleanupCommunicationChannels();

        this.logger.log(`Network ${networkId} destroyed successfully.`);
        return true;
    }
    async cleanupCommunicationChannels() {
        // Track used ports for each service type
        let usedRPCPorts = new Set();
        let usedPeersPorts = new Set();
        let usedSubscriptionPorts = new Set();

        // Iterate through all networks to find the used ports
        this.networks.forEach((network) => {
            const rpc = network.node.GetRPC();
            if (rpc) {
                usedRPCPorts.add(rpc.port);
            }

            const peers = network.node.GetPeers();
            if (peers) {
                usedPeersPorts.add(peers.port);
            }

            const subscriptionServer = network.node.GetSubscriptionServer();
            if (subscriptionServer) {
                usedSubscriptionPorts.add(subscriptionServer.port);
            }
        });

        // Cleanup RPC services that are not in use
        this.PortRPC.forEach((rpcInstance, rpcPort) => {
            if (!usedRPCPorts.has(rpcPort)) {
                rpcInstance.Stop();  // Assuming Stop method exists to stop the RPC service
                this.PortRPC.delete(rpcPort);
                this.logger.log(`Clean up: RPC service on port ${rpcPort} stopped and removed.`);
            }
        });

        // Cleanup Peers services that are not in use
        this.PortPeers.forEach((peersInstance, peerPort) => {
            if (!usedPeersPorts.has(peerPort)) {
                peersInstance.Stop();  // Assuming Stop method exists to stop the Peers service
                this.PortPeers.delete(peerPort);
                this.logger.log(`Clean up: Peers service on port ${peerPort} stopped and removed.`);
            }
        });

        // Cleanup SubscriptionServer services that are not in use
        this.PortSubscription.forEach((subscriptionInstance, subscriptionPort) => {
            if (!usedSubscriptionPorts.has(subscriptionPort)) {
                subscriptionInstance.Stop();  // Assuming Stop method exists to stop the SubscriptionServer service
                this.PortSubscription.delete(subscriptionPort);
                this.logger.log(`Clean up: SubscriptionServer service on port ${subscriptionPort} stopped and removed.`);
            }
        });
    }
}

module.exports = DecentralizedNetwork;
