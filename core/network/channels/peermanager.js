class PeerManager {
    constructor() {
        this.peers = new Set();  // All known peer addresses
        this.peerAddressesForNetworkID = new Map(); // All known peer addresses spcific to a network
        this.connectedPeers = new Set();  // Connected WebSocket connections
        this.connectedPeerAddresses = new Set();  // Connected peer addresses
        this.connectedNodes = new Map();  // NodeId to WebSocket mapping
        this.peerTelemetry = new Map();  // Map of networkId -> Map(nodeId -> telemetryData)
        
        // Collect all network IDs that peers are connected to for cross network relay messaging
        this.activeNetworksOfPeers = new Map();
        this.onNodeConnectedCallbacks = [];
        this.onNodeDisconnectedCallbacks = [];
    }

    // Add new peer addresses
    addPeers(networkId, peerAddresses) {
        peerAddresses.forEach(address => { this.addPeer(networkId, address); });
    }

    // Add a single peer address
    addPeer(networkId, peerAddress) {
        if(this.peerAddressesForNetworkID.get(networkId) == null)
            this.peerAddressesForNetworkID.set(networkId, [peerAddress]);
        else if(!this.peerAddressesForNetworkID.get(networkId).includes(peerAddress))
            this.peerAddressesForNetworkID.set(networkId, this.peerAddressesForNetworkID.get(networkId).concat([peerAddress]));
        this.peers.add(peerAddress);
    }

    // Get all known peer addresses
    getAllPeers() {
        return Array.from(this.peers);
    }

    // Get next available peer to connect to
    getNextAvailablePeer() {
        return Array.from(this.peers)
            .find(peer => !this.connectedPeerAddresses.has(peer));
    }

    // Handle new peer connection
    addConnection(socket, address, nodeId = null) {
        this.connectedPeers.add(socket);
        this.connectedPeerAddresses.add(address);
        if (nodeId) {
            this.connectedNodes.set(nodeId, socket);
        }
    }

    // Handle peer disconnection
    removeConnection(socket, address) {
        this.connectedPeers.delete(socket);
        this.connectedPeerAddresses.delete(address);
        this.removeConnectedNode(socket);
    }

    // Get all connected peers
    getConnectedPeers() {
        return Array.from(this.connectedPeers);
    }

    // Get all connected peer addresses
    getConnectedAddresses() {
        return Array.from(this.connectedPeerAddresses);
    }

    // Check if a peer address is connected
    isConnected(peerAddress) {
        return this.connectedPeerAddresses.has(peerAddress);
    }

    // Associate a nodeId with a socket connection
    setNodeConnection(nodeId, socket) {
        if(this.connectedNodes.get(nodeId) == null)
            this.callOnNodeConnected(nodeId);
        this.connectedNodes.set(nodeId, socket);
    }

    // Remove a node connection
    removeConnectedNode(socket) {
        let nodeIdToRemove = null;
        for (const [nodeId, connectedSocket] of this.connectedNodes.entries()) {
            if (connectedSocket === socket) {
                nodeIdToRemove = nodeId;
                break;
            }
        }
        
        if (nodeIdToRemove) {
            this.connectedNodes.delete(nodeIdToRemove);
            // Remove node telemetry from all networks
            for (const networkMap of this.peerTelemetry.values()) {
                networkMap.delete(nodeIdToRemove);
            }
            return nodeIdToRemove;
        }
        return null;
    }

    // Get socket by nodeId
    getSocketByNodeId(nodeId) {
        return this.connectedNodes.get(nodeId);
    }

    // Add or update telemetry data for a node
    updateTelemetry(nodeId, telemetryData, globalTelemetry) {
        const networkId = telemetryData.networkId;
        
        // Update local maps of networks that can be reached through relay
        if(Array.isArray(globalTelemetry.activeNetworkIDs))
            this.activeNetworksOfPeers.set(nodeId, globalTelemetry.activeNetworkIDs);

        // Initialize network map if it doesn't exist
        if (!this.peerTelemetry.has(networkId)) {
            this.peerTelemetry.set(networkId, new Map());
        }

        // Update telemetry data for this node in the network
        this.peerTelemetry.get(networkId).set(nodeId, telemetryData);
        
        // Only handle relevant networks we are connected to ourselves
        if(!this.peerAddressesForNetworkID.get(networkId))
            return;
        
        // Extend our peer list with who others are connected to
        if(telemetryData.connectedPeers)
            this.addPeers(networkId, telemetryData.connectedPeers);
    }

    // Get all known peer addresses
    getPeerAddressesForNetworkId(networkId) {
        return this.peerAddressesForNetworkID.get(networkId);
    }
    
    // Check if a target network can be reached through one of the peers
    canRelayToNetwork(targetNetworkId)
    {
        for(const [nodeId, activeNetworkIDs] of this.activeNetworksOfPeers)
        {
            if(activeNetworkIDs.includes(targetNetworkId))
                return nodeId;
        }
        
        return false;
    }

    // Event handlers
    onNodeConnected(callback) {
        this.onNodeConnectedCallbacks.push(callback);
    }
    callOnNodeConnected(nodeId) {
        this.onNodeConnectedCallbacks.forEach(callback => callback(nodeId));
    }
    onNodeDisconnected(callback) {
        this.onNodeDisconnectedCallbacks.push(callback);
    }
    callOnNodeDisconnected(nodeId) {
        this.onNodeDisconnectedCallbacks.forEach(callback => callback(nodeId));
    }

    // Get connection stats
    getStats() {
        return {
            totalPeers: this.peers.size,
            connectedPeers: this.connectedPeers.size,
            connectedNodes: this.connectedNodes.size,
            peersWithTelemetry: Array.from(this.peerTelemetry.values()).reduce((total, networkMap) => total + networkMap.size, 0)
        };
    }

    // Get telemetry data for a specific node and network
    getTelemetry(nodeId, networkId) {
        const networkMap = this.peerTelemetry.get(networkId);
        return networkMap ? networkMap.get(nodeId) : undefined;
    }

    // Get all telemetry data for a network
    getAllTelemetry(networkId) {
        return this.peerTelemetry.get(networkId) || new Map();
    }
}

module.exports = PeerManager;