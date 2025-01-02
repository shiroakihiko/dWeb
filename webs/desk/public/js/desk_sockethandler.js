class DeskSocketHandler
{
    constructor() {
        this.activeSockets = new Map(); // The socket connections by network ID
        this.activeSocketAddresses = new Map(); // The socket connections by address
    }
    
    getSocket(networkId) {
        return this.activeSockets.get(networkId);
    }
    
    addSocket(networkId, port) {
        // Return if WS is already set for the network
        if(this.activeSockets.get(networkId))
            return;
            
        // Return existing instance if the address is shared with another network
        const wsAddress = `${window.location.hostname}:${port}`;
        if(this.activeSocketAddresses.get(wsAddress))
        {
            this.activeSockets.set(networkId, this.activeSocketAddresses.get(wsAddress));
            return;
        }
        
        // Initialize new socket to receive data in real-time
        const ws = new WebSocket(`ws://${wsAddress}`);
        ws.onopen = function(event) {
            const subscribeMessage = JSON.stringify({
                action: 'subscribe',
                topic: 'block_confirmation'
            });
            ws.send(subscribeMessage);
        };
        
        this.activeSockets.set(networkId, ws);
        this.activeSocketAddresses.set(wsAddress, ws);
    }
}