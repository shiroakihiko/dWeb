class Desk
{
    constructor() {
        this.availableNetworks = [];
        
        this.getAvailableNetworks();
        this.wallet = new DeskWallet();
        this.gui = new DeskGui();
        this.messageHandler = new DeskMessageHandler();
        this.socketHandler = new DeskSocketHandler();
        this.nav = new DeskNavigation();
        this.name = new DeskName();
        this.events = new DeskEvents();
        this.networkRPCPorts = new Map();
        this.storage = new DeskStorage();
        this.settings = new DeskSettings();
        this.auth = new DeskAuth();
        this.thumbnail = new DeskThumbnail();
        this.action = new DeskAction();
    }

    init(modules = []) {
        this.gui.preloadWebModules(modules);
    }

    async getAvailableNetworks() {
        const response = await fetch('/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ networkId: 'desk', method: 'getAvailableNetworks' })
        });
        const result = await response.json();
        
        this.availableNetworks = result.success ? result.networks : [];
        
        if(result.success)
        {
            // Start the sockets for any network that offers a subscription server
            Object.values(result.networks).forEach(network => {
                if(network.subscriptionPort)
                    this.socketHandler.addSocket(network.id, network.subscriptionPort);
                if(network.rpcPort)
                    this.networkRPCPorts.set(network.id, network.rpcPort);
            });
        }
    }
    
    async networkRequest(requestObject)
    {
        const hostname = window.location.hostname;
        const rpcPort = this.networkRPCPorts.get(requestObject.networkId) ? this.networkRPCPorts.get(requestObject.networkId) : window.location.port; // Use the networks RPC specified port otherwise fallback to the port desk is running under
        
        const response = await fetch(`/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestObject)
        });
        const result = await response.json();
        return result;
    }
}