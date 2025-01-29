let currentDomain = null;

// Initialize the domain manager
document.addEventListener('name.html-load', () => {
    desk.gui.populateNetworkSelect('name');
    desk.gui.onNetworkChange = function() {
        loadMyDomains();
    };
    loadMyDomains();
    
    desk.messageHandler.registerNotificationHandler('register', async (block) => { });
    desk.messageHandler.registerNotificationHandler('transfer', async (block) => { });
    desk.messageHandler.registerNotificationHandler('update', async (block) => { });

    // Set up notification handler for domain-related blocks
    desk.messageHandler.addMessageHandler(desk.gui.activeNetworkId, (message) => {
        try {
            const block = message.block;
            if (block.fromAccount === desk.wallet.publicKey) {
                // Handle different types of domain operations
                switch (block.type) {
                    case 'register':
                        // Add the new domain to the display
                        displayDomains([{
                            name: block.domainName,
                            owner: block.fromAccount
                        }], true);
                        
                        DeskNotifier.show({
                            title: 'Domain Registered',
                            message: `Domain "${block.domainName}" registered successfully`,
                            type: 'domain'
                        });
                        break;
                        
                    case 'transfer':
                        // Refresh domains as we've transferred one away
                        loadMyDomains();
                        DeskNotifier.show({
                            title: 'Domain Transferred',
                            message: `Domain "${block.domainName}" transferred successfully`,
                            type: 'domain'
                        });
                        break;
                        
                    case 'update':
                        DeskNotifier.show({
                            title: 'Domain Updated',
                            message: `Domain "${block.domainName}" updated successfully`,
                            type: 'domain'
                        });
                        break;
                }
            } else if (block.toAccount === desk.wallet.publicKey && block.type === 'transfer') {
                // We received a domain transfer
                displayDomains([{
                    name: block.domainName,
                    owner: block.toAccount
                }], true);
                
                DeskNotifier.show({
                    title: 'Domain Received',
                    message: `Domain "${block.domainName}" received from ${shortenKey(block.fromAccount)}`,
                    type: 'domain'
                });
            }
        } catch (error) {
            console.error('Error handling domain notification:', error);
        }
    });
});

// Load domains owned by the current user
async function loadMyDomains() {
    const result = await desk.networkRequest({
        networkId: desk.gui.activeNetworkId,
        accountId: desk.wallet.publicKey,
        action: 'getMyDomains'
    });

    if (result.success) {
        displayDomains(result.domains);
    }
}

// Display domains in the UI
function displayDomains(domains, prepend = false) {
    const container = document.getElementById('myDomains');
    
    // If domains is empty, clear the display
    if (domains.length === 0) {
        container.innerHTML = '<p>No domains found</p>';
        return;
    }

    // If this is a new single domain, add it to the top
    if (domains.length === 1 && prepend && container.children.length > 0) {
        const domain = domains[0];
        const domainCard = createDomainElement(domain);
        container.insertBefore(domainCard, container.firstChild);
        
        // Optional: Limit the number of displayed domains
        if (container.children.length > 50) {
            container.lastChild.remove();
        }
    } else {
        // Display all domains
        container.innerHTML = '';
        domains.forEach(domain => {
            const domainCard = createDomainElement(domain);
            container.appendChild(domainCard);
        });
    }
}

// Helper function to create domain element
function createDomainElement(domain) {
    const domainCard = document.createElement('div');
    domainCard.className = 'domain-card';
    
    domainCard.innerHTML = `
        <div class="domain-info">
            <h4>${domain.name}</h4>
            <small>Owner: ${shortenKey(domain.owner)}</small>
        </div>
        <div class="domain-actions">
            <button class="ui_button" onclick="editDomain('${domain.name}')">Edit</button>
            <button class="ui_button" onclick="setDefaultDomain('${domain.name}')">Set Default</button>
            <button class="ui_button secondary" onclick="showTransferModal('${domain.name}')">Transfer</button>
        </div>
    `;
    
    return domainCard;
}

// Add transfer-related functions
function showTransferModal(domainName) {
    document.getElementById('transferDomainModal').style.display = 'block';
    document.getElementById('transferringDomain').textContent = domainName;
    document.getElementById('newOwnerKey').value = '';
}

function closeTransferModal() {
    document.getElementById('transferDomainModal').style.display = 'none';
}

async function confirmTransfer() {
    const domainName = document.getElementById('transferringDomain').textContent.toLowerCase();
    const newOwner = document.getElementById('newOwnerKey').value.trim();
    
    if (!newOwner) {
        alert('Please enter the new owner\'s public key');
        return;
    }

    const fromAccount = desk.wallet.publicKey;
    const toAccount = newOwner;
    const delegator = desk.gui.delegator;

    const block = {
        type: 'transfer',
        fromAccount: fromAccount,  // Sender address
        toAccount: toAccount,    // Channel hash as toChannel
        amount: 0,
        delegator: delegator,
        domainName: domainName
    };

    // Add fee to block
    addFeeToBlock(block);

    // Sign the block
    const signature = await base64Encode(await signMessage(canonicalStringify(block)));
    block.signature = signature;

    const result = await desk.networkRequest({
        networkId: desk.gui.activeNetworkId,
        action: 'transferDomain',
        block: block
    });

    if (result.success) {
        alert('Domain transfer initiated successfully!');
        closeTransferModal();
        loadMyDomains();
    } else {
        alert(`Failed to transfer domain: ${result.message}`);
    }
}

// Add set default domain function
async function setDefaultDomain(domainName) {
    const fromAccount = desk.wallet.publicKey;
    const toAccount = fromAccount;
    const delegator = desk.gui.delegator;

    const block = {
        type: 'default',
        fromAccount: fromAccount,  // Sender address
        toAccount: toAccount,    // Channel hash as toChannel
        amount: 0,
        delegator: delegator,
        domainName: domainName
    };

    // Add fee to block
    addFeeToBlock(block);

    // Sign the block (for ledger integrity)
    const signature = await base64Encode(await signMessage(canonicalStringify(block)));
    block.signature = signature;
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'setDefaultDomain', block })

    if (result.success) {
        alert('Domain set as default successfully!');
        loadMyDomains();
    } else {
        alert(`Failed to set default domain: ${result.message}`);
    }
}


// Lookup a domain
async function lookupDomain() {
    const domainName = document.getElementById('domainLookup').value.trim();
    if (!domainName) return;

    const result = await desk.networkRequest({
        networkId: desk.gui.activeNetworkId,
        action: 'lookupDomain',
        domainName
    });

    const lookupResult = document.getElementById('lookupResult');
    lookupResult.style.display = 'block';

    if (result.success) {
        lookupResult.innerHTML = `
            <h4>${domainName}</h4>
            <p>Owner: ${shortenKey(result.domain.owner)}</p>
            <h5>Entries:</h5>
            ${formatEntries(result.domain.entries)}
        `;
    } else {
        lookupResult.innerHTML = `<p>Domain not found or error: ${result.message}</p>`;
    }
}

// Register a new domain
async function registerDomain() {
    const domainName = document.getElementById('newDomainName').value.trim().toLowerCase();
    if (!domainName) return;

    const fromAccount = desk.wallet.publicKey;
    const toAccount = await hashText(domainName);
    const delegator = desk.gui.delegator;

    const block = {
        type: 'register',
        fromAccount: fromAccount,  // Sender address
        toAccount: toAccount,    // Channel hash as toChannel
        amount: 0,
        delegator: delegator,
        domainName: domainName
    };

    // Add fee to block
    addFeeToBlock(block);

    // Sign the block (for ledger integrity)
    const signature = await base64Encode(await signMessage(canonicalStringify(block)));
    block.signature = signature;
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'registerDomain', block })

    if (result.success) {
        alert(`Domain ${domainName} registered successfully!`);
        loadMyDomains();
    } else {
        alert(`Failed to register domain: ${result.message}`);
    }
}

// Edit domain modal
function editDomain(domainName) {
    currentDomain = domainName;
    document.getElementById('editingDomain').textContent = domainName;
    document.getElementById('domainEditorModal').style.display = 'block';
    
    // Load current domain data
    loadDomainData(domainName);
}

// Load domain data for editing
async function loadDomainData(domainName) {
    const result = await desk.networkRequest({
        networkId: desk.gui.activeNetworkId,
        action: 'lookupDomain',
        domainName
    });

    if (result.success) {
        document.getElementById('domainOwner').value = result.domain.owner;
        displayEntries(result.domain.entries);
    }
}

// Display entries in the editor
function displayEntries(entries) {
    const container = document.getElementById('entriesList');
    container.innerHTML = '';

    entries.forEach(entry => {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'entry-item';
        entryDiv.innerHTML = `
            <div class="entry-field">
                <label>Protocol:</label>
                <span>${entry.protocol}</span>
            </div>
            <div class="entry-field">
                <label>Network:</label>
                <span>${entry.networkId}</span>
            </div>
            <div class="entry-field">
                <label>Node:</label>
                <span data-nodeid="${entry.nodeId}">${shortenKey(entry.nodeId)}</span>
            </div>
            <div class="entry-field">
                <label>Content ID:</label>
                <span>${entry.contentId || '-'}</span>
            </div>
            <button class="ui_button secondary" onclick="removeEntry(this)">Remove</button>
        `;
        container.appendChild(entryDiv);
    });
}

// Add new entry
function addEntry() {
    const protocol = document.getElementById('newEntryProtocol').value.trim();
    const networkId = document.getElementById('newEntryNetworkId').value.trim();
    const nodeId = document.getElementById('newEntryNodeId').value.trim();
    const contentId = document.getElementById('newEntryContentId').value.trim();

    if (!protocol || !networkId || !nodeId) {
        alert('Protocol, Network ID and Node ID are required fields');
        return;
    }

    if (!/^[0-9a-fA-F]{64}$/.test(nodeId)) {
        alert('Invalid Node ID format');
        return;
    }

    // Add to entries list
    const entriesList = document.getElementById('entriesList');
    const entryDiv = document.createElement('div');
    entryDiv.className = 'entry-item';
    entryDiv.innerHTML = `
        <div class="entry-field">
            <label>Protocol:</label>
            <span>${protocol}</span>
        </div>
        <div class="entry-field">
            <label>Network:</label>
            <span>${networkId}</span>
        </div>
        <div class="entry-field">
            <label>Node:</label>
            <span data-nodeid="${nodeId}">${shortenKey(nodeId)}</span>
        </div>
        <div class="entry-field">
            <label>Content ID:</label>
            <span>${contentId || '-'}</span>
        </div>
        <button class="ui_button secondary" onclick="removeEntry(this)">Remove</button>
    `;
    entriesList.appendChild(entryDiv);

    // Clear input fields
    document.getElementById('newEntryProtocol').value = '';
    document.getElementById('newEntryNetworkId').value = '';
    document.getElementById('newEntryNodeId').value = '';
    document.getElementById('newEntryContentId').value = '';
}

// Remove an entry
function removeEntry(button) {
    // Remove the parent entry-item div when clicked
    button.closest('.entry-item').remove();
}

// Save domain changes
async function saveDomainChanges() {
    const entries = [];
    document.querySelectorAll('.entry-item').forEach(item => {
        const fields = item.querySelectorAll('.entry-field span');
        const entry = {
            protocol: fields[0].textContent,
            networkId: fields[1].textContent,
            nodeId: fields[2].dataset.nodeid, // Use data attribute instead of title
            contentId: fields[3].textContent !== '-' ? fields[3].textContent : undefined
        };
        entries.push(entry);
    });
    const fromAccount = desk.wallet.publicKey;
    const toAccount = await hashText(currentDomain);
    const delegator = desk.gui.delegator;

    const block = {
        type: 'update',
        fromAccount: fromAccount,  // Sender address
        toAccount: toAccount,    // Channel hash as toChannel
        amount: 0,
        delegator: delegator,
        domainName: currentDomain,
        entries: entries
    };

    // Add fee to block
    addFeeToBlock(block);

    // Sign the block (for ledger integrity)
    const signature = await base64Encode(await signMessage(canonicalStringify(block)));
    block.signature = signature;
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'updateDomain', block })

    if (result.success) {
        alert('Domain updated successfully!');
        closeModal();
        loadMyDomains();
    } else {
        alert(`Failed to update domain: ${result.message}`);
    }
}

// Helper functions
function closeModal() {
    document.getElementById('domainEditorModal').style.display = 'none';
    currentDomain = null;
}

function shortenKey(key) {
    return key.substring(0, 8) + '...' + key.substring(key.length - 8);
}

function formatEntries(entries) {
    return entries.map(entry => `
        <div class="entry-item">
            <span>${entry.protocol}</span>
            <span>${entry.networkId}</span>
            <span>${shortenKey(entry.nodeId)}</span>
        </div>
    `).join('');
} 