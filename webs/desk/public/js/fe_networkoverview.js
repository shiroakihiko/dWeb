// Function to fetch all networks from the server
async function fetchNetworkOverviews() {
    const result = await desk.networkRequest({ networkId: 'desk', method: 'getAllNetworks' });
    if (result.success) {
        const networks = result.networks;
        console.log('Network Overviews:', networks);
        displayNetworkOverviews(networks);
    } else {
        console.error('Failed to fetch network overviews');
    }
}

// Create and populate network overview tabs dynamically
function displayNetworkOverviews(networks) {
    const tabsControl = document.getElementById('tabControlOverview');
    const tabsPages = document.getElementById('tabPagesOverview');
    
    // Clear existing tabs
    tabsControl.innerHTML = '';
    tabsPages.innerHTML = '';
    
    let firstEntry = true;
    // Create individual tabs for each network
    for (const networkId in networks) {
        const tabButton = document.createElement('button');
        tabButton.innerText = networks[networkId].networkName || networkId;
        tabButton.classList.add('tabButton', 'ui_button');
        tabButton.onclick = () => toggleTabVisibility('Overview', 'Overview'+networkId);
        tabsControl.appendChild(tabButton);

        // Create a container for each network overview
        const networkContainer = document.createElement('div');
        networkContainer.id = `tabPage_Overview${networkId}`;
        networkContainer.appendChild(formatNetworkOverview(networks[networkId]));
        networkContainer.classList.add('tabPage');
        networkContainer.style.display = firstEntry ? 'block' : 'none';
        tabsPages.appendChild(networkContainer);
        
        firstEntry = false;
    }
}

// Function to display network overview in the HTML
function formatNetworkOverview(network) {
    const networkDiv = document.createElement('div');
    networkDiv.classList.add('network');

    const networkName = network.networkName || 'Unknown Network';
    const webName = network.webName || 'Unknown Web';

    // Format network weights into a readable table
    let weightsHtml = '';
    if (network.networkWeights && Object.keys(network.networkWeights).length > 0) {
        weightsHtml = `
        <div class="network-weights">
            <h4>Network Voting Weights</h4>
            <table class="weights-table">
                <thead>
                    <tr>
                        <th>Node ID</th>
                        <th>Voting Weight</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(network.networkWeights)
                        .map(([nodeId, weight]) => `
                            <tr>
                                <td>${nodeId}</td>
                                <td>${parseFloat(weight).toFixed(2)}%</td>
                            </tr>
                        `).join('')}
                </tbody>
            </table>
        </div>`;
    }

    networkDiv.innerHTML = `
    <div class="networkEntry">
        <h3>Network: ${networkName} (${webName})</h3>
        <div class="network-stats">
            <div class="stat-item">
                <span class="stat-label">Network ID:</span>
                <span class="stat-value">${network.networkId}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Connected Peers:</span>
                <span class="stat-value">${network.connectedPeersCount}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">Connected Subscribers:</span>
                <span class="stat-value">${network.connectedSubscribersCount}</span>
            </div>
        </div>
        
        <div class="network-details">
            <div class="active-peers">
                <h4>Active Peers</h4>
                <pre>${JSON.stringify(network.activeNetworkPeers, null, 2)}</pre>
            </div>
            ${weightsHtml}
        </div>
    </div>`;
    
    return networkDiv;
}

// Load network overviews on page load
document.addEventListener('networkoverview.html-load', function(){
    // Call the function to fetch and display all networks
    fetchNetworkOverviews();
});

// Toggle visibility of the corresponding overview based on the selected tab
function toggleTabVisibility(controlId, pageId) {
    const tabPages = document.querySelectorAll(`#tabPages${controlId} .tabPage`);
    tabPages.forEach(container => container.style.display = 'none');
    
    const selectedContainer = document.getElementById(`tabPage_${pageId}`);
    if (selectedContainer) {
        selectedContainer.style.display = 'block';
    }
}