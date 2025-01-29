const fs = require('fs');
const path = require('path');

class DeskFrontendServer {
    constructor(options)
    {
    }

    // Request Binding
    bindToNode(node)
    {
        this.node = node;
        node.AddURLMessageHandler(this);

        console.log('Desk Provider Running..');
    }
    unbindFromNode()
    {
        this.node.RemoveURLMessageHandler(this);
    }
    
    // Handling messages
    handleMessage(requestObject)
    {
        try
        {
            this.serveDeskPage(requestObject);
        }
        catch(err)
        {
            this.node.error('Error', err);
        }
    }


    // Handling of the request
    async serveDeskPage(requestObject) {
        const { req, res, requestUrl } = requestObject;
        const method = req.method;
        try{
            if (requestUrl === '/merged-js') {
                // Serve the merged JS file from the public/js/ folder
                this.serveMergedJsFile(req, res);
            } else if (requestUrl === '/') {
                const filePath = path.join(__dirname, '../public', 'login.html');
                fs.readFile(filePath, 'utf8', (err, data) => {
                    if (err) {
                        this.SendRPCResponse(res, { success: false, message: 'Failed to read login page' }, 500);
                        return;
                    }
                    try{
                        res.writeHead(200, { 'Content-Type': this.getContentType(filePath) });
                        res.end(data);
                    }
                    catch(err){
                        console.log(err);
                    }
                });
            } else {
                const requestedPage = requestUrl.replace('/', ''); // Sanitizing the url in case of malicious path traversal requests
                const filePath = path.join(__dirname, '../public/', requestedPage);
                fs.exists(filePath, (exists) => {
                    if (exists && method === 'GET') {
                        const contentType = this.getContentType(filePath);
                        const encoding = contentType.startsWith('text/') || contentType === 'application/javascript' ? 'utf8' : null;

                        fs.readFile(filePath, encoding, (err, data) => {
                            if (err) {
                                this.node.SendRPCResponse(res, { success: false, message: 'Failed to read file' }, 500);
                                return;
                            }
                            try{
                                res.writeHead(200, { 'Content-Type': contentType });
                                res.end(data);
                            }
                            catch(err){
                                console.log(err);
                            }
                        });
                    } else {
                        this.node.SendRPCResponse(res, { success: false, message: 'Page not found' }, 404);
                    }
                });
            }
        }
        catch(err)
        {
            this.node.SendRPCResponse(res, { success: false, message: 'Failed to serve file' }, 500);
        }
    }

    // Serve the merged JS file
    serveMergedJsFile(req, res) {
        const jsFolderPath = path.join(__dirname, '../public/js');
        fs.readdir(jsFolderPath, (err, files) => {
            if (err) {
                this.node.SendRPCResponse(res, { success: false, message: 'Failed to read js directory' }, 500);
                return;
            }

            // Filter out non-JS files
            const jsFiles = files.filter(file => file.endsWith('.js'));

            // Read and concatenate the content of all JS files
            let mergedJsContent = '';
            let filesRead = 0;

            jsFiles.forEach((file) => {
                const filePath = path.join(jsFolderPath, file);
                fs.readFile(filePath, 'utf8', (err, data) => {
                    if (err) {
                        this.node.SendRPCResponse(res, { success: false, message: 'Failed to read JS file' }, 500);
                        return;
                    }

                    mergedJsContent += data;  // Concatenate the JS file contents
                    filesRead++;

                    // When all JS files have been read, send the merged content
                    if (filesRead === jsFiles.length) {
                        try {
                            res.writeHead(200, { 'Content-Type': 'application/javascript' });
                            res.end(mergedJsContent);
                        } catch (err) {
                            console.log(err);
                        }
                    }
                });
            });
        });
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
}

module.exports = DeskFrontendServer;
