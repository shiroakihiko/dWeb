class DeskGui
{
    constructor() {
        this.activeNetworkId = null; // The presently actively selected network on a drop down
        this.delegator = null; // The delegator for the present account
        this.onNetworkChange = null; // Callback when network changed
    }
    
    populateNetworkSelect(webName = null) {
        // Clear previous options
        document.getElementById('networkSelect').innerHTML = '';

        // Fetch available networks (which is an object)
        const networks = desk.availableNetworks;

        // Populate the network selection dropdown
        const networkSelect = document.getElementById('networkSelect');
        let firstNetwork = null;

        // Loop through the networks object
        Object.values(networks).forEach(network => {
            if (webName == null || network.name.webName == webName) {
                if (!firstNetwork) firstNetwork = network;

                const option = document.createElement('option');
                option.value = network.id;
                option.textContent = `[${network.name.webName}] (${network.name.networkName}): ${network.id}`;
                networkSelect.appendChild(option);
            }
        });

        // Set default network selection (first network in the list)
        if (firstNetwork) {
            networkSelect.value = firstNetwork.id;
            this.activeNetworkId = firstNetwork.id;
            this.getAccountInfo(this.activeNetworkId, desk.wallet.publicKey);
        }

        // Add onchange event listener to update activeNetworkId when the selection changes
        networkSelect.addEventListener('change', function(event) {
            this.activeNetworkId = event.target.value;
            this.getAccountInfo(this.activeNetworkId, desk.wallet.publicKey);
            console.log("Active Network ID changed to:", this.activeNetworkId);
            if(this.onNetworkChange)
                this.onNetworkChange();
        }.bind(this));
    }
    
    // Function to fetch account info
    async getAccountInfo(networkId, accountId) {
        console.log("Fetching account info for:", accountId); // Debugging log
        const result = await desk.networkRequest({ networkId: networkId, action: 'getAccount', accountId });
        if (result.success) {
            const balance = result.accountInfo.balance;
            const lastBlockHash = result.accountInfo.lastBlockHash;
            this.delegator = result.accountInfo.delegator ? result.accountInfo.delegator : this.getRandomDelegator(networkId); 
            
            document.getElementById('balance').textContent = balance;
            document.getElementById('delegator').textContent = this.delegator;
        } else {
            this.delegator = this.getRandomDelegator(networkId);
            document.getElementById('balance').textContent = '-new account-';
            document.getElementById('delegator').textContent = this.delegator;
        }
    }
    
    // Get a random delegator of a network
    getRandomDelegator(networkId)
    {
        if(desk.availableNetworks[networkId])
            if(desk.availableNetworks[networkId].delegators.length > 0)
                return desk.availableNetworks[networkId].delegators[0];
        
        return desk.wallet.publicKey; // Pick ourselves as delegator if there are no others in the network
    }
}