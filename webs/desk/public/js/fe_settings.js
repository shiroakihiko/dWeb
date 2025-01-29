
document.addEventListener('settings.html-load', async function(e) {
    await loadNetworkSettings();
    document.getElementById('privateKeyText').textContent = desk.wallet.privateKey;
});

async function loadNetworkSettings() {
    const nameSelect = document.getElementById('nameNetwork');
    const thumbnailSelect = document.getElementById('thumbnailNetwork');
    
    // Clear existing options
    nameSelect.innerHTML = '';
    thumbnailSelect.innerHTML = '';
    
    // Add options for each available network
    for (const [networkId, network] of Object.entries(desk.availableNetworks)) {
        if (network.name.webName === 'name') {
            const option = new Option(
                `${network.name.networkName} (${networkId})`, 
                networkId,
                false,
                networkId === desk.settings.get('networks.name')
            );
            nameSelect.add(option);
        }
        if (network.name.webName === 'thumbnail') {
            const option = new Option(
                `${network.name.networkName} (${networkId})`, 
                networkId,
                false,
                networkId === desk.settings.get('networks.thumbnail')
            );
            thumbnailSelect.add(option);
        }
    }
}

function togglePrivateKeyVisibility() {
    const privateKeyText = document.getElementById('privateKeyText');
    const toggleButton = document.querySelector('.toggle-visibility i');
    
    if (privateKeyText.classList.contains('visible')) {
        privateKeyText.classList.remove('visible');
        toggleButton.classList.remove('fa-eye-slash');
        toggleButton.classList.add('fa-eye');
    } else {
        privateKeyText.classList.add('visible');
        toggleButton.classList.remove('fa-eye');
        toggleButton.classList.add('fa-eye-slash');
    }
}

async function copyPrivateKey() {
    try {
        await navigator.clipboard.writeText(desk.wallet.privateKey);
        DeskNotifier.show({
            title: 'Copied',
            message: 'Private key copied to clipboard',
            type: 'success',
            duration: 2000
        });
    } catch (err) {
        DeskNotifier.show({
            title: 'Error',
            message: 'Failed to copy private key',
            type: 'error'
        });
    }
}

async function saveSettings() {
    const saveStatus = document.getElementById('saveStatus');
    try {
        const nameNetwork = document.getElementById('nameNetwork').value;
        const thumbnailNetwork = document.getElementById('thumbnailNetwork').value;
        
        await desk.settings.set('networks.name', nameNetwork);
        await desk.settings.set('networks.thumbnail', thumbnailNetwork);
        
        // Clear caches to force refresh with new network settings
        desk.name.cachedDomainsByAccount = {};
        desk.name.cachedDomainsByName = {};
        desk.thumbnail.clearCache();
        
        saveStatus.textContent = 'Settings saved successfully!';
        saveStatus.className = 'save-status success';
        
        // Hide success message after 3 seconds
        setTimeout(() => {
            saveStatus.style.display = 'none';
        }, 3000);
        
    } catch (error) {
        saveStatus.textContent = 'Error saving settings: ' + error.message;
        saveStatus.className = 'save-status error';
    }
}