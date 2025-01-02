// File system state
let files = [];
let browserHistory = [];
let currentHistoryIndex = -1;

// Initialize the file system
document.addEventListener('filesystem.html-init', () => {
    desk.gui.populateNetworkSelect('file');
    desk.gui.onNetworkChange = loadFiles;
    loadFiles();
    
    // Set up WebSocket handling
    const socket = desk.socketHandler.getSocket(desk.gui.activeNetworkId);
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.message.action === 'block_confirmation' && data.message.block.type === 'file') {
            if (data.message.networkId == desk.gui.activeNetworkId) {
                loadFiles();
            }
        }
    };
});

// Load user's files
async function loadFiles() {
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'getFiles', accountId: desk.wallet.publicKey });
    if (result.success) {
        files = result.files;
        displayFiles(result.files);
    }
}

// Display files in the file list
function displayFiles(files) {
    const filesDiv = document.getElementById('files');
    filesDiv.innerHTML = '';
    
    if(files.length == 0)
        return;
    files.forEach(file => {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'file-item';
        fileDiv.innerHTML = `
            <span class="fileName">${file.fileName}</span>
            <span class="contentType">${file.contentType}</span>
            <span class="contentId">ID: ${file.hash.substring(0, 8)}...</span>
            <button class="viewFileButton" onclick="viewFile('${file.hash}')">View</button>
            <button class="fileDetailsButton" onclick="viewFileDetails('${file.hash}')">Share</button>
        `;
        filesDiv.appendChild(fileDiv);
        
        const fileDetailsDiv = document.createElement('div');
        fileDetailsDiv.id = 'details-'+file.hash;
        fileDetailsDiv.style.display = 'none';
        fileDetailsDiv.className = 'file-details';
        fileDetailsDiv.innerHTML = `
            <div class="fileDetails">
                Address: <input type="text" value="dweb://${file.hash}"></input><br />
                Global Address: <input type="text" value="dweb://${file.hash}@${desk.gui.activeNetworkId}"></input>
            </div>
        `;
        filesDiv.appendChild(fileDetailsDiv);
    });
}

// File encryption using the provided secret
async function encryptFile(fileData, secret) {
    if (!secret) return fileData; // Return unencrypted if no secret provided
    
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(fileData);
    
    // Generate encryption key from secret
    const secretKey = await hashText(secret);
    const keyBytes = hexToUint8Array(secretKey);
    
    // Encrypt the file data
    const nonce = nacl.randomBytes(24);
    const encryptedData = nacl.secretbox(dataBytes, nonce, keyBytes);
    
    return base64Encode(nonce) + ':' + base64Encode(encryptedData);
}

// File decryption using the provided secret
async function decryptFile(encryptedData, secret) {
    if (!secret || !encryptedData.includes(':')) return encryptedData;
    
    const [nonceB64, dataB64] = encryptedData.split(':');
    const nonce = base64Decode(nonceB64);
    const data = base64Decode(dataB64);
    
    // Generate decryption key from secret
    const secretKey = await hashText(secret);
    const keyBytes = hexToUint8Array(secretKey);
    
    // Decrypt the file data
    const decryptedBytes = nacl.secretbox.open(data, nonce, keyBytes);
    if (!decryptedBytes) throw new Error('Decryption failed');
    
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBytes);
}

// Upload a file
async function uploadFile() {
    const fileInput = document.getElementById('fileInput');
    const secretInput = document.getElementById('secretKey');
    const contentTypeSelect = document.getElementById('contentType');
    
    if (!fileInput.files[0]) {
        alert('Please select a file');
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        const fileData = e.target.result;
        const secret = secretInput.value.trim();
        const contentType = contentTypeSelect.value;
        
        // Encrypt file if secret provided
        const processedData = await encryptFile(fileData, secret);
        
        // Create and send file block
        const block = await createFileBlock(processedData, contentType, file.name, secret ? true : false);
        
        const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'uploadFile', block });
        if (result.success) {
            fileInput.value = '';
            secretInput.value = '';
            loadFiles();
        } else {
            alert('Error uploading file: ' + result.message);
        }
    };
    
    reader.readAsText(file);
}

// Create a file block
async function createFileBlock(fileData, contentType, fileName, isEncrypted) {
    const fromAccount = desk.wallet.publicKey;
    const toAccount = desk.wallet.publicKey;
    const delegator = desk.gui.delegator;
    const lastBlockHashes = await getLastBlockHashes([fromAccount, toAccount, delegator]);
    
    const block = {
        type: 'file',
        fromAccount,
        toAccount,
        delegator,
        amount: 0,
        fee: '1000000000',
        burnAmount: '500000000',
        delegatorReward: '500000000',
        data: fileData,
        contentType,
        fileName,
        isEncrypted,
        previousBlockSender: lastBlockHashes[fromAccount],
        previousBlockRecipient: lastBlockHashes[toAccount],
        previousBlockDelegator: lastBlockHashes[delegator]
    };
    
    const signature = await base64Encode(await signMessage(canonicalStringify(block)));
    block.signature = signature;
    
    return block;
}

// Get last block hashes
async function getLastBlockHashes(accounts) {
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'getLastBlockHashes', accounts });
    return result.success ? result.hashes : {};
}

// Clean up function to handle iframe cleanup
function cleanupContent() {
    const iframe = document.getElementById('contentFrame');
    if (iframe.src) {
        URL.revokeObjectURL(iframe.src);
        iframe.src = 'about:blank';
    }
}

// Browser navigation functions
function browserBack() {
    if (currentHistoryIndex > 0) {
        cleanupContent();
        currentHistoryIndex--;
        loadContent(browserHistory[currentHistoryIndex]);
    }
}

function browserForward() {
    if (currentHistoryIndex < browserHistory.length - 1) {
        cleanupContent();
        currentHistoryIndex++;
        loadContent(browserHistory[currentHistoryIndex]);
    }
}

function browserRefresh() {
    if (currentHistoryIndex >= 0) {
        cleanupContent();
        loadContent(browserHistory[currentHistoryIndex]);
    }
}

// Load content by ID
async function loadContent(contentId) {
    contentId = contentId || document.getElementById('urlBar').value.trim();
    if (!contentId) return;
    
    // Strip dweb:// prefix if present
    contentId = contentId.replace('dweb://', '');
    
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, action: 'getFile', contentId });
    if (result.success) {
        // Update browser history
        if (contentId !== browserHistory[currentHistoryIndex]) {
            browserHistory = browserHistory.slice(0, currentHistoryIndex + 1);
            browserHistory.push(contentId);
            currentHistoryIndex = browserHistory.length - 1;
        }
        
        // Update URL bar with dweb:// prefix
        document.getElementById('urlBar').value = `dweb://${contentId}`;
        
        try {
            let content = result.file.data;
            if (result.file.isEncrypted) {
                const secret = prompt('This file is encrypted. Please enter the secret key:');
                if (secret) {
                    content = await decryptFile(content, secret);
                } else {
                    return;
                }
            }
            
            const iframe = document.getElementById('contentFrame');
            const preDisplay = document.getElementById('contentDisplay');
            
            if (result.file.contentType === 'text/html') {
                // Inject link interception script into HTML content
                const linkInterceptScript = `
                    <script>
                    document.addEventListener('click', (e) => {
                        const link = e.target.closest('a');
                        if (link && link.href.startsWith('dweb://')) {
                            e.preventDefault();
                            window.parent.postMessage({
                                type: 'dwebNavigate',
                                url: link.href
                            }, '*');
                        }
                    });
                    </script>
                `;
                
                content = content.replace('</head>', `${linkInterceptScript}</head>`);
                if (!content.includes('</head>')) {
                    content = `<head>${linkInterceptScript}</head>${content}`;
                }
                
                // Use iframe for HTML content
                iframe.style.display = 'block';
                preDisplay.style.display = 'none';
                
                // Create a secure sandbox
                const blob = new Blob([content], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                
                iframe.onload = () => {
                    URL.revokeObjectURL(url);
                };
                
                iframe.src = url;
            } else {
                // Use pre element for plain text content
                iframe.style.display = 'none';
                preDisplay.style.display = 'block';
                preDisplay.textContent = content;
            }
        } catch (error) {
            alert('Error displaying file: ' + error.message);
        }
    } else {
        alert('Error loading content: ' + result.message);
    }
}


// Add message event listener for iframe communication
window.addEventListener('message', (event) => {
    if (event.data.type === 'dwebNavigate') {
        // Handle dweb:// navigation
        loadContent(event.data.url);
    }
});

// View a specific file
function viewFile(contentId) {
    document.getElementById('urlBar').value = `dweb://${contentId}`;
    loadContent(contentId);
}

// Share a specific file
function viewFileDetails(contentId) {
    document.querySelectorAll('.file-details').forEach(element => {
        element.style.display = 'none';
    });
    document.getElementById('details-'+contentId).style.display = 'block';
}