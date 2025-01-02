document.addEventListener('blockexplorer.html-init', async function(e) {
    desk.gui.populateNetworkSelect();
    
    const networkSelect = document.getElementById('blockExplorerNetworkSelect');
    Object.values(desk.availableNetworks).forEach(network => {
        const option = document.createElement('option');
        option.value = network.id;
        option.textContent = `[${network.name.webName}] (${network.name.networkName}): ${network.id}`;
        networkSelect.appendChild(option);
    });
    networkSelect.value = networkSelect.childNodes[0].value;
});

// Block property labels mapping
const blockLabels = {
    'hash': 'Block Hash',
    'timestamp': 'Timestamp',
    'fee': 'Fee',
    'delegatorReward': 'Delegator Reward',
    'burnAmount': 'Burn Amount',
    'fromAccount': 'From Account',
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
    const resultDiv = document.getElementById('result');

    if (!query) {
        alert('Please enter a block hash, block type, or account ID');
        return;
    }

    resultDiv.innerHTML = 'Loading...';

    // Search for block or account using the generic function
    const response = await getBlockOrAccount(networkId, query);

    // Handle the response
    if (response.block) {
        displayBlock(response.block);
    } else if (response.account) {
        displayAccount(response.account);
    } else {
        resultDiv.innerHTML = 'No results found';
    }
}

async function getBlockOrAccount(networkId, query) {
    const block = await getBlockByHash(networkId, query);
    if (block) return { block };

    const account = await getAccountDetails(networkId, query);
    if (account) return { account };

    return {};
}

async function getBlockByHash(networkId, blockHash) {
    const result = await desk.networkRequest({ networkId: networkId, action: 'getBlock', blockHash: blockHash });
    return result.success ? result.block : null;
}

async function getAccountDetails(networkId, accountId) {
    const result = await desk.networkRequest({ networkId: networkId, action: 'getAccountDetails', accountId: accountId });
    return result.success ? result : null;
}

function displayBlock(block) {
    if (!block) {
        document.getElementById('result').innerHTML = 'Block not found';
        return;
    }

    let html = `<div class="rpc_result"><h3>Block Hash: <a href="#" onclick="searchBlock('${block.hash}')">${block.hash}</a></h3>`;

    for (let key in block) {
        if (block.hasOwnProperty(key) && block[key] !== null && block[key] !== undefined) {
            let label = blockLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            let value = block[key];

            // Handle linked properties for "fromAccount", "toAccount", "delegator", and block senders/recipients
            if (key === 'fromAccount' || key === 'toAccount' || key === 'delegator' ||
                key === 'previousBlockSender' || key === 'previousBlockRecipient' || key === 'previousBlockDelegator') {
                value = `<a href="#" onclick="searchAccount('${value}')">${value}</a>`;
                }

                if (Array.isArray(value)) {
                    html += `<p><strong>${label}:</strong></p><ul>`;
                    value.forEach(item => html += `<li>${item}</li>`);
                    html += `</ul>`;
                } else if (typeof value === 'object') {
                    html += `<p><strong>${label}:</strong><pre class="json-view">${JSON.stringify(value, null, 2)}</pre></p>`;
                } else {
                    html += `<p><strong>${label}:</strong> ${value}</p>`;
                }
        }
    }

    html += `</div>`;
    document.getElementById('result').innerHTML = html;
}
function displayAccount(account) {
    if (!account) {
        document.getElementById('result').innerHTML = 'Account not found';
        return;
    }

    let html = `<div class="rpc_result"><h3>Account ID: <a href="#" onclick="searchAccount('${account.accountInfo.hash}')">${account.accountInfo.hash}</a></h3>`;

    // Loop through the account details
    for (let key in account.accountInfo) {
        if (account.accountInfo.hasOwnProperty(key) && account.accountInfo[key] !== null && account.accountInfo[key] !== undefined) {
            let label = accountLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            let value = account.accountInfo[key];

            // Handle linked properties for "delegator" and "lastBlockHash"
            if (key === 'delegator' || key === 'lastBlockHash') {
                value = `<a href="#" onclick="searchBlock('${value}')">${value}</a>`;
            }

            if (Array.isArray(value)) {
                html += `<p><strong>${label}:</strong></p><ul>`;
                value.forEach(item => html += `<li>${item}</li>`);
                html += `</ul>`;
            } else if (typeof value === 'object') {
                html += `<p><strong>${label}:</strong><pre class="json-view">${JSON.stringify(value, null, 2)}</pre></p>`;
            } else {
                html += `<p><strong>${label}:</strong> ${value}</p>`;
            }
        }
    }

    // Handle related blocks section
    if (account.blocks && account.blocks.length > 0) {
        html += `<h4>Related Blocks:</h4><ul>`;
        account.blocks.forEach(block => {
            // Determine if the block is incoming or outgoing
            let directionIcon = '';
            if (block.toAccount === account.accountInfo.hash) {
                directionIcon = '<span class="icon-incoming">⬅️</span>';  // Incoming icon (you can use your preferred icon)
            } else if (block.fromAccount === account.accountInfo.hash) {
                directionIcon = '<span class="icon-outgoing">➡️</span>';  // Outgoing icon (you can use your preferred icon)
            }

            html += `<li>
            ${directionIcon} Block Hash: <a href="#" onclick="searchBlock('${block.hash}')">${block.hash}</a> [${block.type}] | Amount: ${block.amount} | Fee: ${block.fee}
            </li>`;
        });
        html += `</ul>`;
    }

    html += `</div>`;
    document.getElementById('result').innerHTML = html;
}

function searchBlock(blockHash) {
    document.getElementById('searchInput').value = blockHash;
    search();
}

function searchAccount(accountId) {
    document.getElementById('searchInput').value = accountId;
    search();
}
