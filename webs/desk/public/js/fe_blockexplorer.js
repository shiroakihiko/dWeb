document.addEventListener('blockexplorer.html-load', async function(e) {
    desk.gui.populateNetworkSelect();
    
    const networkSelect = document.getElementById('blockExplorerNetworkSelect');
    networkSelect.innerHTML = '';
    Object.values(desk.availableNetworks).forEach(network => {
        const option = document.createElement('option');
        option.value = network.id;
        option.textContent = `[${network.name.webName}] (${network.name.networkName}): ${network.id}`;
        networkSelect.appendChild(option);
    });
    networkSelect.value = networkSelect.childNodes[0].value;
    
    const params = e.detail.linkParams;
    if (params.search) {
        processSearch(params.search.query, params.search.networkId);
        document.getElementById('searchInput').value = params.search.query;
        networkSelect.value = params.search.networkId;
    }
});

// Action property labels mapping
const actionLabels = {
    'hash': 'Action Hash',
    'timestamp': 'Timestamp',
    'fee': 'Fee',
    'delegatorReward': 'Delegator Reward',
    'burnAmount': 'Burn Amount',
    'account': 'From Account',
    'toAccount': 'To Account',
    'delegator': 'Delegator',
    'previousBlockSender': 'Previous Block Sender',
    'previousBlockRecipient': 'Previous Block Recipient',
    'previousBlockDelegator': 'Previous Block Delegator',
    'data': 'Data',
    // Add more mappings here as needed
};

const accountLabels = {
    'accountInfo': 'Account Info',
    'balance': 'Balance',
    'blockCount': 'Block Count',
    'blocks': 'Related Blocks',
    'delegator': 'Delegator',
    'lastBlockHash': 'Last Block Hash',
    'startBlock': 'Start Block',
    'networkValidatorWeights': 'Network Validator Weights',
    // Add more mappings for account properties as needed
};

async function search() {
    const query = document.getElementById('searchInput').value.trim();
    const networkId = document.getElementById('blockExplorerNetworkSelect').value;

    if (!query) {
        alert('Please enter a block hash, block type, or account ID');
        return;
    }
    await processSearch(query, networkId);
}
async function processSearch(query, networkId)
{
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = 'Loading...';

    // First try to get block
    const block = await getBlock(networkId, query);
    if (block) {
        displayBlock(block);
        return;
    }

    // If not a block, try action or account
    const response = await getActionOrAccount(networkId, query);
    if (response.action) {
        displayAction(response.action);
    } else if (response.account) {
        displayAccount(response.account);
    } else {
        resultDiv.innerHTML = 'No results found';
    }
}

async function getActionOrAccount(networkId, query) {
    const action = await getActionByHash(networkId, query);
    if (action) return { action };

    const account = await getAccountDetails(networkId, query);
    if (account) return { account };

    return {};
}

async function getActionByHash(networkId, actionHash) {
    const result = await desk.networkRequest({ networkId: networkId, method: 'getAction', actionHash: actionHash });
    return result.success ? result.action : null;
}

async function getAccountDetails(networkId, accountId) {
    const result = await desk.networkRequest({ networkId: networkId, method: 'getAccountDetails', accountId: accountId });
    return result.success ? result : null;
}

async function getBlock(networkId, blockHash) {
    const result = await desk.networkRequest({ 
        networkId: networkId, 
        method: 'getBlock', 
        blockHash: blockHash 
    });
    return result.success ? result.block : null;
}

// Add this helper function for consistent hash display
function formatHash(hash, type = '') {
    return `<span class="hash-value ${type}">${hash}</span>`;
}

// Update formatInstruction to be more concise
function formatInstruction(instruction, compact = false) {
    if (!instruction) return '';
    
    if (compact) {
        // Create a compact single-line summary
        let summary = '';
        if (instruction.type) {
            summary += `<span class="instruction-type">${instruction.type}</span>`;
        }
        if (instruction.toAccount) {
            summary += ` to ${instruction.toAccount.substring(0, 8)}...`;
        }
        if (instruction.amount) {
            summary += ` Amount: ${instruction.amount}`;
        }
        return `<div class="instruction-compact">${summary}</div>`;
    }
    
    let html = `<div class="instruction-item">
        <div class="instruction-header">Instruction</div>
        <div class="instruction-content">`;
    
    for (let instKey in instruction) {
        let instLabel = instKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        let instValue = instruction[instKey];

        if (['toAccount'].includes(instKey)) {
            instValue = `<a class="account-link" href="#" onclick="searchAccount('${instValue}')">${instValue}</a>`;
        }

        if (typeof instValue === 'object' && instValue !== null) {
            html += `<div class="data-row">
                <span class="label">${instLabel}:</span>
                <pre class="json-view">${JSON.stringify(instValue, null, 2)}</pre>
            </div>`;
        } else {
            html += `<div class="data-row">
                <span class="label">${instLabel}:</span>
                <span class="value">${instValue}</span>
            </div>`;
        }
    }
    html += `</div></div>`;
    
    return html;
}

function displayAction(action) {
    if (!action) {
        document.getElementById('result').innerHTML = '<div class="error-message">Action not found</div>';
        return;
    }

    let html = `<div class="rpc_result">
        <div class="block-header">
            <h3>Action Details</h3>
            <div class="action-hash">${formatHash(action.hash, 'action')}</div>
        </div>
        <div class="block-content">`;

    // Display action properties except instructions
    for (let key in action) {
        if (key === 'instruction') continue;
        
        if (action.hasOwnProperty(key) && action[key] !== undefined) {
            let label = actionLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            let value = action[key];

            // Handle links for accounts and block hash
            if (['account', 'delegator'].includes(key)) {
                value = `<a class="account-link" href="#" onclick="searchAccount('${value}')">${value}</a>`;
            } else if (key === 'blockHash') {
                value = `<a class="hash-link" href="#" onclick="searchBlock('${value}')">${formatHash(value, 'block')}</a>`;
            } else if (key === 'hash') {
                value = `<a class="hash-link" href="#" onclick="searchAction('${value}')">${formatHash(value, 'action')}</a>`;
            } else if (key === 'signatures' && typeof value === 'object') {
                value = `<div class="signatures-list">`;
                for (let signer in action.signatures) {
                    value += `<div class="signature-item">
                        <div class="signer"><a class="account-link" href="#" onclick="searchAccount('${signer}')">${signer}</a></div>
                        <div class="signature">${action.signatures[signer]}</div>
                    </div>`;
                }
                value += `</div>`;
            }

            if (Array.isArray(value)) {
                html += `<div class="data-row">
                    <span class="label">${label}:</span>
                    <div class="value"><ul>`;
                value.forEach(item => html += `<li>${item}</li>`);
                html += `</ul></div></div>`;
            } else if (typeof value === 'object') {
                html += `<div class="data-row">
                    <span class="label">${label}:</span>
                    <pre class="json-view">${JSON.stringify(value, null, 2)}</pre>
                </div>`;
            } else {
                html += `<div class="data-row">
                    <span class="label">${label}:</span>
                    <span class="value">${value}</span>
                </div>`;
            }
        }
    }

    // Add formatted instruction if it exists
    if (action.instruction) {
        html += formatInstruction(action.instruction);
    }
    
    html += `</div></div>`;
    document.getElementById('result').innerHTML = html;
}

function displayAccount(account) {
    if (!account) {
        document.getElementById('result').innerHTML = '<div class="error-message">Account not found</div>';
        return;
    }

    let html = `<div class="rpc_result">
        <div class="block-header">
            <h3>Account Details</h3>
            <div class="account-hash">${formatHash(account.accountInfo.hash, 'account')}</div>
        </div>
        <div class="block-content">`;

    // Loop through the account details
    for (let key in account.accountInfo) {
        if (account.accountInfo.hasOwnProperty(key) && account.accountInfo[key] !== undefined) {
            let label = accountLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            let value = account.accountInfo[key];

            // Handle links for hashes
            if (['delegator', 'lastBlockHash', 'lastActionHash', 'startActionHash'].includes(key)) {
                const linkType = key.includes('Block') ? 'block' : (key === 'delegator' ? 'account' : 'action');
                const onClickFn = key.includes('Block') ? 'searchBlock' : (key === 'delegator' ? 'searchAccount' : 'searchAction');
                value = `<a class="hash-link" href="#" onclick="${onClickFn}('${value}')">${formatHash(value, linkType)}</a>`;
            }

            if (Array.isArray(value)) {
                html += `<div class="data-row">
                    <span class="label">${label}:</span>
                    <div class="value"><ul>`;
                value.forEach(item => html += `<li>${item}</li>`);
                html += `</ul></div></div>`;
            } else if (typeof value === 'object') {
                html += `<div class="data-row">
                    <span class="label">${label}:</span>
                    <pre class="json-view">${JSON.stringify(value, null, 2)}</pre>
                </div>`;
            } else {
                html += `<div class="data-row">
                    <span class="label">${label}:</span>
                    <span class="value">${value}</span>
                </div>`;
            }
        }
    }

    // Updated Related Actions section
    if (account.actions && account.actions.length > 0) {
        html += `<div class="actions-section">
            <div class="section-title">Related Actions (${account.actions.length})</div>
            <div class="actions-list">`;
        
        account.actions.forEach(action => {
            const isIncoming = action.instruction.toAccount === account.accountInfo.hash;
            const isOutgoing = action.account === account.accountInfo.hash;
            const directionClass = isIncoming ? 'incoming' : (isOutgoing ? 'outgoing' : 'related');
            
            const otherParty = isIncoming ? action.account : action.instruction.toAccount;
            const directionText = isIncoming ? 'From' : 'To';

            html += `<div class="action-item ${directionClass}">
                <div class="action-summary" onclick="toggleActionDetails(this)">
                    <span class="action-type">${action.instruction?.type || 'Unknown'}</span>
                    <span class="account-brief">${directionText}: ${otherParty.substring(0, 8)}...</span>
                    <a class="hash-link" href="#" onclick="searchAction('${action.hash}')">${action.hash.substring(0, 8)}...</a>
                    ${formatInstruction(action.instruction, true)}
                    <span class="timestamp">${new Date(action.timestamp).toLocaleString()}</span>
                </div>
                <div class="action-details hidden">
                    <div class="action-properties">`;

            // Add action properties
            for (let key in action) {
                if (key === 'instruction') continue;
                let label = actionLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                let value = action[key];

                if (['account', 'delegator'].includes(key)) {
                    value = `<a class="account-link" href="#" onclick="searchAccount('${value}')">${value}</a>`;
                } else if (key === 'hash') {
                    value = `<a class="hash-link" href="#" onclick="searchAction('${value}')">${formatHash(value, 'action')}</a>`;
                } else if (key === 'blockHash') {
                    value = `<a class="hash-link" href="#" onclick="searchBlock('${value}')">${formatHash(value, 'block')}</a>`;
                } else if (key === 'signatures' && typeof value === 'object') {
                    value = `<div class="signatures-list">`;
                    for (let signer in action.signatures) {
                        value += `<div class="signature-item">
                            <div class="signer"><a class="account-link" href="#" onclick="searchAccount('${signer}')">${signer}</a></div>
                            <div class="signature">${action.signatures[signer]}</div>
                        </div>`;
                    }
                    value += `</div>`;
                }

                html += `<div class="data-row">
                    <span class="label">${label}:</span>
                    <span class="value">${value}</span>
                </div>`;
            }

            // Add instruction details
            if (action.instruction) {
                html += formatInstruction(action.instruction);
            }

            html += `</div></div></div>`;
        });
        html += `</div></div>`;
    }

    html += `</div></div>`;
    document.getElementById('result').innerHTML = html;
}

function displayBlock(block) {
    if (!block) {
        document.getElementById('result').innerHTML = '<div class="error-message">Block not found</div>';
        return;
    }

    let html = `<div class="rpc_result block-view">
        <div class="block-header">
            <h3>Block Details</h3>
            <div class="block-hash">${formatHash(block.hash, 'block')}</div>
        </div>
        <div class="block-content">`;

    // Display block properties, excluding actions
    for (let key in block) {
        if (key === 'actions') continue;
        
        let label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        let value = block[key];

        if (key === 'previousBlockHash' && value !== 'None') {
            value = `<a class="hash-link" href="#" onclick="searchBlock('${value}')">${formatHash(value, 'block')}</a>`;
        } else if (key === 'creator') {
            value = `<a class="account-link" href="#" onclick="searchAccount('${value}')">${value}</a>`;
        }

        if (Array.isArray(value)) {
            html += `<div class="data-row">
                <span class="label">${label}:</span>
                <div class="value"><ul>`;
            value.forEach(item => html += `<li>${item}</li>`);
            html += `</ul></div></div>`;
        } else if (key === 'signatures' && typeof value === 'object') {
            html += `<div class="data-row">
                <span class="label">${label}:</span>
                <div class="value signatures-list">`;
            for (let signer in value) {
                html += `<div class="signature-item">
                    <div class="signer"><a class="account-link" href="#" onclick="searchAccount('${signer}')">${signer}</a></div>
                    <div class="signature">${value[signer]}</div>
                </div>`;
            }
            html += `</div></div>`;
        } else if (typeof value === 'object' && value !== null) {
            html += `<div class="data-row">
                <span class="label">${label}:</span>
                <pre class="json-view">${JSON.stringify(value, null, 2)}</pre>
            </div>`;
        } else {
            html += `<div class="data-row">
                <span class="label">${label}:</span>
                <span class="value">${value}</span>
            </div>`;
        }
    }

    // Display actions in compact format
    if (block.actions && block.actions.length > 0) {
        html += `<div class="actions-section">
            <div class="section-title">Actions (${block.actions.length})</div>
            <div class="actions-list">`;
        
        block.actions.forEach((action, index) => {
            html += `<div class="action-item">
                <div class="action-summary" onclick="toggleActionDetails(this)">
                    <span class="action-number">#${index + 1}</span>
                    <span class="action-type">${action.instruction?.type || 'Unknown'}</span>
                    <span class="account-brief">From: ${action.account.substring(0, 8)}...</span>
                    ${action.instruction.toAccount ? `<span class="account-brief">To: ${action.instruction.toAccount.substring(0, 8)}...</span>` : ''}
                    <a class="hash-link" href="#" onclick="searchAction('${action.hash}')">${action.hash.substring(0, 8)}...</a>
                    ${formatInstruction(action.instruction, true)}
                    <span class="timestamp">${new Date(action.timestamp).toLocaleString()}</span>
                </div>
                <div class="action-details hidden">
                    <div class="action-properties">`;

            // Action properties
            for (let actionKey in action) {
                if (actionKey === 'instruction') continue;
                let actionLabel = actionLabels[actionKey] || actionKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                let actionValue = action[actionKey];

                if (['account', 'delegator'].includes(actionKey)) {
                    actionValue = `<a class="account-link" href="#" onclick="searchAccount('${actionValue}')">${actionValue}</a>`;
                } else if (actionKey === 'hash') {
                    actionValue = `<a class="hash-link" href="#" onclick="searchAction('${actionValue}')">${formatHash(actionValue, 'action')}</a>`;
                } else if (actionKey === 'blockHash') {
                    actionValue = `<a class="hash-link" href="#" onclick="searchBlock('${actionValue}')">${formatHash(actionValue, 'block')}</a>`;
                } else if (actionKey === 'signatures' && typeof actionValue === 'object') {
                    actionValue = `<div class="signatures-list">`;
                    for (let signer in action.signatures) {
                        actionValue += `<div class="signature-item">
                            <div class="signer"><a class="account-link" href="#" onclick="searchAccount('${signer}')">${signer}</a></div>
                            <div class="signature">${action.signatures[signer]}</div>
                        </div>`;
                    }
                    actionValue += `</div>`;
                }

                html += `<div class="data-row">
                    <span class="label">${actionLabel}:</span>
                    <span class="value">${actionValue}</span>
                </div>`;
            }

            // Add instruction details
            if (action.instruction) {
                html += `<div class="instruction-details">
                    ${formatInstruction(action.instruction)}
                </div>`;
            }

            html += `</div></div></div>`;
        });
        
        html += `</div></div>`;
    }

    html += `</div></div>`;
    document.getElementById('result').innerHTML = html;
}

function searchAction(actionHash) {
    document.getElementById('searchInput').value = actionHash;
    search();
}

function searchAccount(accountId) {
    document.getElementById('searchInput').value = accountId;
    search();
}

function searchBlock(blockHash) {
    document.getElementById('searchInput').value = blockHash;
    search();
}

// Add this function to handle expanding/collapsing action details
function toggleActionDetails(element) {
    const details = element.nextElementSibling;
    details.classList.toggle('hidden');
    element.classList.toggle('expanded');
}
