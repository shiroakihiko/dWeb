const fs = require('fs');
const path = require('path');

class URLMessageHandler {
    constructor(network) {
        this.network = network;
        this.node = network.node;
        this.actionManager = network.actionManager;
    }
    
    // Handling messages
    handleMessage(requestObject) {
        try {
            const { requestUrl } = requestObject;
            const urlParts = requestUrl.split('/').filter(part => part); // Split and remove empty parts
            
            if (urlParts.length === 0) {
                // Handle root path
                this.handleRoot(requestObject);
                return;
            }

            // Get the first segment to determine the action
            const action = urlParts[0];
            
            switch (action) {
                case 'getFile':
                    if (urlParts.length < 2) {
                        this.SendRPCResponse(requestObject.res, { success: false, message: 'Missing file ID' }, 400);
                        return;
                    }

                    this.getFile(requestObject.res, {
                        networkId: this.network.id,
                        contentId: urlParts[1]
                    });
                    break;

                case 'static':
                    // Handle static files (js, css, images etc)
                    this.serveStaticFile(requestObject, urlParts.slice(1).join('/'));
                    break;

                default:
                    this.SendRPCResponse(requestObject.res, { success: false, message: 'Invalid endpoint' }, 404);
            }
        } catch (err) {
            this.node.error('Error', err);
            this.SendRPCResponse(requestObject.res, { success: false, message: 'Internal server error' }, 500);
        }
    }

    // Handle root path
    handleRoot(requestObject) {
        const { res } = requestObject;
        this.SendRPCResponse(res, { success: true, message: 'File Network API' });
    }

    // Serve static files
    serveStaticFile(requestObject, filePath) {
        const { req, res } = requestObject;
        
        // Sanitize the file path to prevent directory traversal
        const sanitizedPath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
        const fullPath = path.join(__dirname, '../public/', sanitizedPath);

        fs.exists(fullPath, (exists) => {
            if (!exists || req.method !== 'GET') {
                this.SendRPCResponse(res, { success: false, message: 'File not found' }, 404);
                return;
            }

            const contentType = this.getContentType(fullPath);
            const encoding = contentType.startsWith('text/') || contentType === 'application/javascript' ? 'utf8' : null;

            fs.readFile(fullPath, encoding, (err, data) => {
                if (err) {
                    this.SendRPCResponse(res, { success: false, message: 'Failed to read file' }, 500);
                    return;
                }

                try {
                    res.writeHead(200, { 'Content-Type': contentType });
                    res.end(data);
                } catch (err) {
                    console.log(err);
                    this.SendRPCResponse(res, { success: false, message: 'Failed to serve file' }, 500);
                }
            });
        });
    }

    // Helper method for sending RPC responses
    SendRPCResponse(res, data, statusCode = 200) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
    }

    // Helper function to get the content type based on file extension
    getContentType(filePath) {
        const extname = path.extname(filePath).toLowerCase();
        switch (extname) {
            case '.html':
                return 'text/html';
            case '.css':
                return 'text/css';
            case '.js':
                return 'application/javascript';
            case '.json':
                return 'application/json';
            case '.jpg':
            case '.jpeg':
                return 'image/jpeg';
            case '.png':
                return 'image/png';
            case '.gif':
                return 'image/gif';
            default:
                return 'application/octet-stream';
        }
    }

    // Get account details (balance, actions)
    async getFile(res, data) {
        const { networkId, contentId } = data;

        // Check if contentId contains a colon (":")
        let file = null;
        if (contentId.includes('@')) {
            // Split contentId into contentId and targetNetworkId
            const [contentIdPart, targetNetworkId] = contentId.split('@');
            
            // Set the peer message type
            data.type = 'getFile';
            data.contentId = contentIdPart; // Remove the network part from the content id

            // Call sendTargetNetwork if a targetNetworkId exists
            const relayed = this.node.relayToTargetNetwork(targetNetworkId, data, (message) => {
                // Pass on the response from the target network
                file = message.file;    
            });
            if(!relayed)
                this.node.SendRPCResponse(res, { success: false, message: `Network ${targetNetworkId} could not be reached` });
                
        } else {
            // Process contentId normally (no colon)
            const action = this.network.ledger.getAction(contentId);

            if (action != null) {
                file = action;
            } else {
                this.node.SendRPCResponse(res, { success: false, message: 'Content not found' });
            }
        }

        try {
            if (file.instruction.isEncrypted) {
                // For encrypted files, serve a decryption page
                const decryptionPage = this.generateDecryptionPage(file.instruction);
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(decryptionPage);
            } else {
                // For unencrypted files, serve directly
                const contentType = this.getContentType(file.instruction.fileName);
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(file.instruction.data);
            }
        } catch (err) {
            console.log(err);
            this.SendRPCResponse(res, { success: false, message: 'Error serving file' }, 500);
        }
    }

    generateDecryptionPage(fileInstruction) {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Decrypt File</title>
    <script src="/desk/js/crypto/blake3.umd.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl.min.js"></script>
    <script>
        // Helper function to convert hex to Uint8Array
        function hexToUint8Array(hexString) {
            return new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        }

        // Helper function for base64 decoding
        function base64Decode(str) {
            const binString = atob(str);
            return new Uint8Array(binString.split('').map(x => x.charCodeAt(0)));
        }

        // Initialize hasher globally
        let hasher = null;
        (async function initHasher() {
            hasher = await hashwasm.createBLAKE3();
        })();

        // Hash function for generating key from password
        async function hashText(text) {
            // Convert text to Uint8Array first
            const textEncoder = new TextEncoder();
            const inputBytes = textEncoder.encode(text);
            
            // Then hash it
            hasher.init();
            hasher.update(inputBytes);
            return hasher.digest();
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

        async function decryptAndDisplay() {
            try {
                const password = document.getElementById('password').value;
                if (!password) {
                    alert('Please enter a password');
                    return;
                }

                const encryptedData = '${fileInstruction.data}';
                const fileName = '${fileInstruction.fileName}';
                const contentType = '${fileInstruction.contentType || "application/octet-stream"}';

                const decrypted = await decryptFile(encryptedData, password);
                const blob = new Blob([decrypted], { type: contentType });
                const url = URL.createObjectURL(blob);

                // Hide decrypt form
                document.getElementById('decrypt-form').style.display = 'none';

                // Show success message and options
                const resultDiv = document.getElementById('result');
                resultDiv.innerHTML = \`
                    <div class="success-message">File decrypted successfully!</div>
                    <div class="buttons">
                        <button onclick="saveFile('\${fileName}', '\${url}')">Save File</button>
                        <button onclick="openFile('\${url}', '\${contentType}')">Open in Browser</button>
                    </div>
                \`;
                resultDiv.style.display = 'block';
            } catch (error) {
                alert('Decryption failed. Wrong password?');
                console.error(error);
            }
        }

        function saveFile(fileName, url) {
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }

        function openFile(url, contentType) {
            if (contentType.startsWith('image/') || contentType.startsWith('text/') || contentType === 'application/pdf') {
                window.location.href = url;
            } else {
                alert('This file type can only be saved, not viewed in browser');
                saveFile('${fileInstruction.fileName}', url);
            }
        }
    </script>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 40px;
            background: #f5f5f5;
        }
        .container { 
            max-width: 600px; 
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h2 { 
            margin-top: 0;
            color: #333;
        }
        input[type="password"] { 
            padding: 10px;
            margin: 10px 0;
            width: 100%;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        .buttons {
            margin-top: 15px;
        }
        button { 
            padding: 10px 20px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-right: 10px;
        }
        button:hover { 
            background: #0056b3;
        }
        .success-message {
            padding: 15px;
            background: #e8f5e9;
            border-radius: 4px;
            color: #2e7d32;
            margin-bottom: 15px;
        }
        #result {
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <div id="decrypt-form">
            <h2>Encrypted File: ${fileInstruction.fileName}</h2>
            <p>This file is encrypted. Please enter the password to decrypt:</p>
            <input type="password" id="password" placeholder="Enter password">
            <button onclick="decryptAndDisplay()">Decrypt File</button>
        </div>
        <div id="result"></div>
    </div>
</body>
</html>`;
    }
}

module.exports = URLMessageHandler;
