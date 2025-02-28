// Initialize delegator changer
document.addEventListener('delegators.html-load', () => {
    const networkSelect = document.getElementById('delegatorNetworkSelect');
    networkSelect.innerHTML = '';
    Object.values(desk.availableNetworks).forEach(network => {
        const option = document.createElement('option');
        option.value = network.id;
        option.textContent = `[${network.name.webName}] (${network.name.networkName}): ${network.id}`;
        networkSelect.appendChild(option);
    });
    networkSelect.value = networkSelect.childNodes[0].value;
});

async function changeDelegator() {
    const accountId = document.getElementById('accountInput').value.trim();
    const newDelegator = document.getElementById('newDelegator').value.trim();
    const networkId = document.getElementById('delegatorNetworkSelect').value;
    
    // Clear previous status
    const statusElement = document.getElementById('statusMessage');
    statusElement.className = 'status-message';
    statusElement.style.display = 'none';

    // Validate inputs
    if (!accountId || !newDelegator) {
        showDelegatorStatus('Please fill in all fields', 'error');
        return;
    }

    try {
        const instruction = {
            type: 'delegator',
            account: accountId,
            toAccount: accountId,
            newDelegator: newDelegator,
            amount: 1000
        };
        const sendResult = await desk.action.sendAction(networkId, instruction);
        if (sendResult.success) {
            showDelegatorStatus('Delegator change request submitted successfully!', 'success');
            // Clear the form
            document.getElementById('newDelegator').value = '';
        } else {
            showDelegatorStatus('Failed to change delegator: ' + sendResult.message, 'error');
        }
    } catch (error) {
        showDelegatorStatus('Error: ' + error.message, 'error');
    }
}

function showDelegatorStatus(message, type) {
    const statusElement = document.getElementById('statusMessage');
    statusElement.textContent = message;
    statusElement.className = 'status-message ' + type;
    statusElement.style.display = 'block';
}