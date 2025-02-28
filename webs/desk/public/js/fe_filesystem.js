// File system state
let files = [];
let browserHistory = [];
let currentHistoryIndex = -1;

// Initialize the file system
document.addEventListener('filesystem.html-load', (event) => {
    desk.gui.populateNetworkSelect('file');
    desk.gui.onNetworkChange = loadFiles;
    loadFiles();
    
    // Set up notification handler for file-related blocks
    desk.messageHandler.registerNotificationHandler('file', async (block) => { });
    
    // Set up message handler for file updates
    desk.messageHandler.addMessageHandler(desk.gui.activeNetworkId, (message) => {
        try {
            const action = message.action;
            if (action.instruction.type === 'file') {
                if (action.account === desk.wallet.publicKey) {
                    // Add the new file to the display
                    displayFiles([action], true);
                    
                    DeskNotifier.show({
                        title: 'File Uploaded',
                        message: `File "${action.instruction.fileName}" uploaded successfully`,
                        type: 'file'
                    });
                }
            }
        } catch (error) {
            console.error('Error handling file notification:', error);
        }
    });

    const params = event.detail.linkParams;
    if (params.loadPage) {
        loadContent(params.loadPage.replace('dweb://', ''));
    }
});

// Load user's files
async function loadFiles() {
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, method: 'getFiles', accountId: desk.wallet.publicKey });
    if (result.success) {
        files = result.files;
        displayFiles(result.files);
    }
}

// Display files in the file list
function displayFiles(files, prepend = false) {
    const filesDiv = document.getElementById('files');
    
    // If files is empty, clear the display
    if (files.length === 0) {
        filesDiv.innerHTML = '<p>No files found</p>';
        return;
    }

    // If this is a new single file, add it to the top
    if (files.length === 1 && prepend && filesDiv.children.length > 0) {
        const file = files[0];
        const fileElements = createFileElements(file);
        
        // Insert both the file item and its details
        filesDiv.insertBefore(fileElements.detailsDiv, filesDiv.firstChild);
        filesDiv.insertBefore(fileElements.fileDiv, filesDiv.firstChild);
        
        // Optional: Limit the number of displayed files
        if (filesDiv.children.length > 100) { // 50 files * 2 elements per file
            filesDiv.lastChild.remove();
            filesDiv.lastChild.remove();
        }
    } else {
        // Display all files
        filesDiv.innerHTML = '';
        files.forEach(file => {
            const fileElements = createFileElements(file);
            filesDiv.appendChild(fileElements.fileDiv);
            filesDiv.appendChild(fileElements.detailsDiv);
        });
    }
}

// Helper function to create file elements
function createFileElements(file) {
    const fileDiv = document.createElement('div');
    fileDiv.className = 'file-item';
    fileDiv.innerHTML = `
        <div class="file-info">
            <div class="fileName">${file.instruction.fileName}</div>
            <div class="file-meta">
                <span class="contentType">${file.instruction.contentType}</span>
                <span class="contentId">ID: ${file.hash.substring(0, 8)}...</span>
            </div>
        </div>
        <div class="file-actions">
            <button class="viewFileButton" onclick="viewFile('${file.hash}')">View</button>
            <button class="fileDetailsButton" onclick="viewFileDetails('${file.hash}')">Share</button>
        </div>
    `;

    const fileDetailsDiv = document.createElement('div');
    fileDetailsDiv.id = 'details-' + file.hash;
    fileDetailsDiv.style.display = 'none';
    fileDetailsDiv.className = 'file-details';
    fileDetailsDiv.innerHTML = `
        <div class="fileDetails">
            Address: <input type="text" value="dweb://${file.hash}"></input><br />
            Global Address: <input type="text" value="dweb://${file.hash}@${desk.gui.activeNetworkId}"></input>
        </div>
    `;

    return { fileDiv, detailsDiv: fileDetailsDiv };
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
        
        const instruction = {
            type: 'file',
            account: desk.wallet.publicKey,
            toAccount: desk.wallet.publicKey,
            amount: 0,
            data: processedData,
            contentType,
            fileName: file.name,
            isEncrypted: secret ? true : false
        };
        const sendResult = await desk.action.sendAction(desk.gui.activeNetworkId, instruction);
        if (sendResult.success) {
            alert('File uploaded successfully');
            fileInput.value = '';
            secretInput.value = '';
            loadFiles();
        }
        else {
            alert('Error uploading file: ' + sendResult.message);
        }
    };
    
    reader.readAsText(file);
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
function getDomainEntry(protocol, domainInfo)
{
    for(const entry of domainInfo.entries)
    {
        if(entry.protocol == protocol)
            return entry;
    }
    return null;
}
// Load content by ID
async function loadContent(url) {
    url = url || document.getElementById('urlBar').value.trim();
    if (!url) return;
        
    // Strip dweb:// prefix if present
    url = url.replace('dweb://', '');
    contentId = url;

    // Check for @ in contentId (e.g., contentId@domain)
    if (contentId.includes('@')) {
        const [content, domain] = contentId.split('@');
        const domainInfo = await desk.name.resolveName(domain);
        if(domainInfo)
        {
            const entry = getDomainEntry('file', domainInfo);
            if (entry) {
                if(entry.networkId)
                    contentId = content + '@' + entry.networkId;
            }
        }
    } else {
        const domainInfo = await desk.name.resolveName(contentId);
        if (domainInfo) {
            const entry = getDomainEntry('file', domainInfo);
            if (entry) {
                if(entry.contentId)
                    contentId = entry.contentId;
                if(entry.networkId)
                    contentId += '@' + entry.networkId;
            }
        }
    }
    
    const result = await desk.networkRequest({ networkId: desk.gui.activeNetworkId, method: 'getFile', contentId });
    if (result.success) {
        // Update browser history
        if (contentId !== browserHistory[currentHistoryIndex]) {
            browserHistory = browserHistory.slice(0, currentHistoryIndex + 1);
            browserHistory.push(contentId);
            currentHistoryIndex = browserHistory.length - 1;
        }
        
        // Update URL bar with dweb:// prefix
        document.getElementById('urlBar').value = `dweb://${url}`;
        
        try {
            let content = result.file.instruction.data;
            if (result.file.instruction.isEncrypted) {
                const secret = prompt('This file is encrypted. Please enter the secret key:');
                if (secret) {
                    content = await decryptFile(content, secret);
                } else {
                    return;
                }
            }
            
            const iframe = document.getElementById('contentFrame');
            const preDisplay = document.getElementById('contentDisplay');
            
            if (result.file.instruction.contentType === 'text/html') {
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

// Add this function at the end of the file
function toggleFileList() {
    const fileList = document.getElementById('fileList');
    fileList.style.display = fileList.style.display === 'none' || fileList.style.display === '' ? 'block' : 'none';
}

// Add these styles to the existing styles in filesystem.html
const styles = `
.file-item {
    padding: 10px;
    border-bottom: 1px solid #eee;
}

.file-info {
    margin-bottom: 8px;
}

.file-meta {
    font-size: 12px;
    color: #666;
}

.file-actions {
    display: flex;
    gap: 5px;
}

.file-actions button {
    padding: 4px 8px;
    font-size: 12px;
}
`;