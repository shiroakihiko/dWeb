const path = require('path');
const Wallet = require('../wallet/wallet.js');
const Signer = require('../utils/signer.js');
const Hasher = require('../utils/hasher.js');

class Telemetry {
    constructor(dnetwork) {
        this.dnetwork = dnetwork;
        
        // Get the node wallet for signing
        this.nodeWallet = new Wallet(path.join(process.cwd(), 'wallets', 'node.json'));
        
        // Start periodic telemetry exchange
        this.startTelemetryExchange();
    }

    async initialize() {
        await this.nodeWallet.initialize();
        this.nodeId = this.nodeWallet.getPublicKeys()[0]; // Node ID used for ED25519 signing
        this.nodePrivateKey = this.nodeWallet.getAccounts()[0].privateKey;
    }


    // Periodically send telemetry data to each peer
    // There can be several networks on a single port so we aggregate the data beforehand
    async startTelemetryExchange() {
        setTimeout(async () => {
            if (!this.dnetwork.PortPeers.size) return;
            
            // Iterate through each peer channel (PortPeers map contains peer connections)
            for (const [peerPort, peersInstance] of this.dnetwork.PortPeers){
                // Collect all telemetry data for networks using this peer instance
                let aggregatedTelemetryData = [];

                // Iterate over each network using that peers channel instance
                for(const [networkId, network] of this.dnetwork.networks) {
                    const peers = network.node.GetPeers();
                    if (peers && peers.port == peerPort) {
                        const telemetryData = this.getNetworkTelemetryData(networkId);
                        aggregatedTelemetryData.push({
                            networkId: networkId,
                            telemetry: telemetryData,
                            connectedPeers: peers.peerManager.getPeerAddressesForNetworkId(networkId)
                        });
                    }
                }
                // Only send telemetry data if we have any to send
                if (aggregatedTelemetryData.length > 0) {
                    // Get telemetry data beyond the scope of a network.
                    const globalTelemetry = this.generateTelemetryData();
                    
                    // Send aggregated telemetry to the peer
                    let telemetryRequest = {
                        type: 'telemetry',
                        telemetry: aggregatedTelemetryData,
                        globalTelemetry: globalTelemetry,
                        networkId: 'dnetwork'  // Generic network ID for aggregated data
                    };
                    // Add nodeId (public key) to the message data
                    telemetryRequest.nodeId = this.nodeId;
                    // Convert message data to a JSON string
                    telemetryRequest = JSON.stringify(telemetryRequest);

                    // Sign the message
                    let signature = await Signer.signMessage(telemetryRequest, this.nodePrivateKey);
                    
                    peersInstance.sendAll({ message: telemetryRequest, signature });
                }
            }

            this.startTelemetryExchange();
        }, 5000); // Send telemetry every 5 seconds
    }

    // Get telemetry data for a specific network
    getNetworkTelemetryData(networkId) {
        let telemetryData = {};
        if (typeof this.dnetwork.networks.get(networkId).getTelemetryData === 'function') {
            telemetryData = this.dnetwork.networks.get(networkId).getTelemetryData();
        }

        return telemetryData;
    }
    ReceivedPeerMessage(message, socket) {
        if (message.networkId !== 'dnetwork')
            return;
        if (message.type != 'telemetry')
            return;
        
        for(const telemetryUpdate of message.telemetry)
        {
            for(const [networkId, network] of this.dnetwork.networks)
            {
                if(network.node && telemetryUpdate.networkId === networkId)
                {
                    const peersInstance = network.node.GetPeers();
                    if(peersInstance)
                    {
                        peersInstance.peerManager.updateTelemetry(message.nodeId, telemetryUpdate, message.globalTelemetry);
                    }
                }
            }
        }
    }
    // Generate telemetry data
    generateTelemetryData() {
        const bandwidthCapacity = this.getBandwidthCapacity();
        const activeNetworks = this.dnetwork.activeNetworkIDs();
        const uptime = this.getUptime();
        const version = 'v1.0.0';
        const activeNetworkIDs = Object.keys(this.dnetwork.activeNetworkIDs());

        return {
            activeNetworkIDs,
            bandwidthCapacity,
            activeNetworks,
            uptime,
            version
        };
    }

    // Get the bandwidth capacity (Example method)
    getBandwidthCapacity() {
        // Logic to calculate the node's bandwidth capacity (this is just a placeholder)
        return '1000kbps';
    }

    // Get the uptime of the node (Example method)
    getUptime() {
        // Return uptime in seconds (this is just a placeholder)
        return Math.floor(process.uptime());
    }

}

module.exports = Telemetry;
