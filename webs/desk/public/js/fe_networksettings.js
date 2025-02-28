// Function to fetch all networks from the server
async function fetchAllNetworks() {
    const result = await desk.networkRequest({ networkId: 'desk', method: 'getAllNetworks' });
    if (result.success) {
        const networks = result.networks;
        console.log('All Networks:', networks);
        // Display the networks after fetching them
        createNetworkTabs(networks);
    } else {
        console.error('Failed to fetch networks');
    }
}

// Create and populate network tabs dynamically
function createNetworkTabs(availableNetworks) {
    const tabsControl = document.getElementById('tabControlOverview');
    const tabsPages = document.getElementById('tabPagesOverview');
    
    // Clear existing tabs (not the log containers)
    tabsControl.innerHTML = '';
    tabsPages.innerHTML = '';
    
    let firstEntry = true;
    // Create individual tabs for each network and their log containers
    for (const networkId in availableNetworks) {
        const tabButton = document.createElement('button');
        tabButton.innerText = availableNetworks[networkId].networkName || networkId;
        tabButton.classList.add('tabButton');
        tabButton.classList.add('ui_button');
        tabButton.onclick = () => toggleTabVisibility('Overview', 'Overview'+networkId);
        tabsControl.appendChild(tabButton);

        // Create a container for each network log (hidden by default)
        const networkContainer = document.createElement('div');
        networkContainer.id = `tabPage_Overview${networkId}`;
        networkContainer.appendChild(formatNetworkDetails(availableNetworks[networkId]));
        networkContainer.classList.add('tabPage');
        networkContainer.style.display = firstEntry ? 'block' : 'none'; // Hide initially
        tabsPages.appendChild(networkContainer);
        
        firstEntry = false;
    }

    // Add event listener for network deletion (e.g., clicking a delete button next to each network)
    document.querySelectorAll('.deleteNetworkButton').forEach(button => {
        button.addEventListener('click', async () => {
            const networkId = button.getAttribute('data-network-id');
            await deleteNetwork(networkId);
        });
    });
}


// Function to display networks in the HTML
function formatNetworkDetails(network) {
    const networkDiv = document.createElement('div');
    networkDiv.classList.add('network');

    const networkName = network.networkName || 'Unknown Network';
    const webName = network.webName || 'Unknown Web';

    networkDiv.innerHTML = `
    <div class="networkEntry">
    <h3>Network: ${networkName} (${webName})</h3>
    <p><strong>Network ID:</strong> ${network.networkId}</p>
    <p><strong>Network Name:</strong> ${network.networkName}</p>
    <p><strong>Connected Peers Count:</strong> ${network.connectedPeersCount}</p>
    <p><strong>Connected Subscribers Count:</strong> ${network.connectedSubscribersCount}</p>
    <pre><strong>Active Peers:</strong> ${JSON.stringify(network.activeNetworkPeers, null, 2)}</pre>
    <pre><strong>Network Configuration:</strong> ${JSON.stringify(network.network, null, 2)}</pre>
    <button class="ui_button deleteNetworkButton" data-network-id="${network.networkId}">Delete Network</button>
    </div>
    `;
    
    return networkDiv;
}
// Function to join a network
async function joinNetwork() {
    const networkId = document.getElementById('joinNetworkId').value;
    const peerPort = document.getElementById('joinPeerPort').value;
    const rpcPort = document.getElementById('joinRpcPort').value;
    const subscriberPort = document.getElementById('joinSubscriberPort').value;
    const peers = document.getElementById('joinPeers').value.split(',').map(peer => peer.trim());

    const networkConfig = {
        networkId: networkId,
        peerPort: parseInt(peerPort),
        rpcPort: parseInt(rpcPort),
        subscriberPort: parseInt(subscriberPort),
        peers: peers
    };

    const result = await desk.networkRequest({ networkId: 'desk', method: 'joinNetwork', networkConfig });
    if (result.success) {
        alert('Successfully joined the network!');
        fetchAllNetworks();  // Refresh network list
    } else {
        alert('Failed to join network: ' + result.message);
    }
}
// Function to delete a network
async function deleteNetwork(targetNetworkId) {
    const result = await desk.networkRequest({ networkId: 'desk', method: 'deleteNetwork', targetNetworkId });
    if (result.success) {
        alert('Network deleted successfully');
        fetchAllNetworks();  // Refresh network list
    } else {
        alert('Failed to delete network: ' + result.message);
    }
}

// Populate the Web Module Select dropdown dynamically
function populateWebSelect() {
    // Select all elements with the class 'webselect'
    const webSelectElements = document.querySelectorAll('.webSelect');
    
    // Iterate over each element with the 'webselect' class
    webSelectElements.forEach(webSelect => {
        // Clear previous options
        webSelect.innerHTML = '<option value="">Select a Web Module</option>';
        
        // Iterate over available networks and populate the select dropdown with the webName of each network
        for (const networkId in desk.availableNetworks) {
            const webName = desk.availableNetworks[networkId].name.webName;
            const option = document.createElement('option');
            option.value = webName;
            option.textContent = webName;
            webSelect.appendChild(option);
        }
    });
}

// Load email history on page load
document.addEventListener('networkexplorer.html-load', function(){
    populateWebSelect();
    desk.gui.populateNetworkSelect();
    // Call the function to fetch and display all networks
    fetchAllNetworks();
    
    document.getElementById('createNetworkForm').addEventListener('submit', async (event) => {
        event.preventDefault();  // Prevent form from submitting normally

        const networkName = document.getElementById('createNetworkName').value;
        const peerPort = document.getElementById('createPeerPort').value;
        const rpcPort = document.getElementById('createRpcPort').value;
        const subscriptionPort = document.getElementById('createSubscriberPort').value;
        const peers = document.getElementById('createPeers').value.split(',').map(peer => peer.trim());
        const webName = document.getElementById('createWebName').value;

        // Validate Network Name
        if (!/^[a-zA-Z0-9\-]+$/.test(networkName)) {
            alert('Network name must not contain spaces or special characters.');
            return;
        }

        const networkConfig = {
            webName: webName,
            networkName: networkName,
            peerPort: parseInt(peerPort),
            rpcPort: parseInt(rpcPort),
            subscriptionPort: parseInt(subscriptionPort),
            peers: peers
        };

        const result = await desk.networkRequest({ networkId: 'desk', method: 'createNetwork', networkConfig });
        if (result.success) {
            alert('Network created successfully');
            fetchAllNetworks();
        } else {
            alert('Failed to create network: ' + result.message);
        }
    });

    // Add event listener for form submission (join network form)
    document.getElementById('joinNetworkForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        await joinNetwork();
    });
});



// Toggle visibility of the corresponding log container based on the selected tab
function toggleTabVisibility(controlId, pageId) {
    const tabPages = document.querySelectorAll(`#tabPages${controlId} .tabPage`);

    // Hide all containers
    tabPages.forEach(container => container.style.display = 'none');

    // Show the selected container
    const selectedContainer = document.getElementById(`tabPage_${pageId}`);
    if (selectedContainer) {
        selectedContainer.style.display = 'block';
    }
}