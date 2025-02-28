

        // Decrypt the message
        async function decryptMessageRSA(encryptedMessageBase64, senderPublicKey) {
            const encryptedMessageBytes = base64Decode(encryptedMessageBase64);
            const nonceBytes = encryptedMessageBytes.slice(0, nacl.box.nonceLength);
            const encryptedBytes = encryptedMessageBytes.slice(nacl.box.nonceLength);

            const senderPublicKeyBytes = hexToUint8Array(senderPublicKey);
            const senderDHPublicKey = ed2curve.convertPublicKey(senderPublicKeyBytes);
            
            const privateKeyBytes = hexToUint8Array(desk.wallet.privateKey).slice(0, 32);
            const privateDHSecretKey = ed2curve.convertSecretKey(privateKeyBytes);
            
            const decryptedBytes = nacl.box.open(encryptedBytes, nonceBytes, senderDHPublicKey, privateDHSecretKey);

            if (!decryptedBytes) {
                console.log('Decryption failed');
                return null;
            }

            const decoder = new TextDecoder();
            return decoder.decode(decryptedBytes);
        }

        // Encrypt a message using the recipient's public key
        async function encryptMessageRSA(message, recipientPublicKey) {
            const encoder = new TextEncoder();
            const messageBytes = encoder.encode(message);
            
            const recipientPublicKeyBytes = hexToUint8Array(recipientPublicKey);
            const recipientDHPublicKey = ed2curve.convertPublicKey(recipientPublicKeyBytes);
            
            const privateKeyBytes = hexToUint8Array(desk.wallet.privateKey).slice(0, 32);
            const privateDHSecretKey = ed2curve.convertSecretKey(privateKeyBytes);

            const nonceBytes = nacl.randomBytes(nacl.box.nonceLength);
            const encryptedMessage = nacl.box(messageBytes, nonceBytes, recipientDHPublicKey, privateDHSecretKey);

            const combinedBytes = new Uint8Array(nonceBytes.length + encryptedMessage.length);
            combinedBytes.set(nonceBytes, 0);
            combinedBytes.set(encryptedMessage, nonceBytes.length);

            return base64Encode(combinedBytes);
        }

        // Sign a message
        async function signMessage(message) {
            const messageHash = await hashText(message);
            const encoder = new TextEncoder();
            const messageBytes = encoder.encode(messageHash);
            return nacl.sign.detached(messageBytes, hexToUint8Array(desk.wallet.privateKey));
        }

        // Verify the signature
        async function verifySignature(data, signature, senderPublicKey) {
            const messageHash = await hashText(data);
            const encoder = new TextEncoder();
            const messageBytes = encoder.encode(messageHash);
            const senderPublicKeyBytes = hexToUint8Array(senderPublicKey);
            const signatureBytes = base64Decode(signature);
            return nacl.sign.detached.verify(messageBytes, signatureBytes, senderPublicKeyBytes);
        }

        // Convert hex string to Uint8Array (for seed)
        function hexToUint8Array(hex) {
            const byteArray = [];
            for (let i = 0; i < hex.length; i += 2) {
                byteArray.push(parseInt(hex.substr(i, 2), 16));
            }
            return new Uint8Array(byteArray);
        }

        // Convert a Uint8Array to a hex string
        function arrayToHex(arr) {
            return Array.from(arr).map(byte => byte.toString(16).padStart(2, '0')).join('');
        }

        // Concatenate two Uint8Arrays
        function concatArrays(arr1, arr2) {
            const combined = new Uint8Array(arr1.length + arr2.length);
            combined.set(arr1, 0);
            combined.set(arr2, arr1.length);
            return combined;
        }

        // Convert buffer to hexadecimal string
        function bufferToHex(buffer) {
            const uint8Array = new Uint8Array(buffer);
            return uint8Array.reduce((hexString, byte) => hexString + byte.toString(16).padStart(2, '0'), '');
        }

        // Base64 encode a Uint8Array
        function base64Encode(uint8Array) {
            return btoa(String.fromCharCode(...uint8Array)); //btoa(String.fromCharCode(...uint8Array));
        }

        // Base64 decode
        function base64Decode(base64Str) {
            const binaryString = atob(base64Str);
            const uint8Array = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                uint8Array[i] = binaryString.charCodeAt(i);
            }
            return uint8Array;
        }

        // Sorts the object before stringifying it
        function canonicalStringify(obj) {
            const sortedObj = Object.keys(obj)
            .sort()
            .reduce((acc, key) => {
                acc[key] = obj[key];
                return acc;
            }, {});
            return JSON.stringify(sortedObj);
        }

        // Parse URL parameters
        function getUrlParams() {
            const hash = window.location.hash.substring(1);
            return Object.fromEntries(
                hash.split('&').map(param => param.split('='))
            );
        }

        // Update URL with parameters
        function updateUrlParams(params) {
            const newHash = Object.entries(params)
                .map(([key, value]) => `${key}=${value}`)
                .join('&');
            window.location.hash = newHash;
        }
        // Initialize hasher globally
        let hasher = null;
        (async function initHasher() {
            hasher = await hashwasm.createBLAKE3();
        })();
        // Utility functions for encryption/decryption
        async function hashText(text) {
            // Convert text to Uint8Array first
            const textEncoder = new TextEncoder();
            const inputBytes = textEncoder.encode(text);
            
            // Then hash it

            hasher.init();
            hasher.update(inputBytes);
            return hasher.digest();
            /*
            let context = blake2bInit(32, null);
            blake2bUpdate(context, inputBytes);
            const hash = blake2bFinal(context);
            return bufferToHex(hash);
            */
        }

        // Unit conversion for balances and amounts
        function convertToDisplayUnit(input)
        {
            return new Decimal(input).dividedBy(new Decimal('100000000')).toFixed(8, Decimal.ROUND_HALF_DOWN);
        }
        function convertToRawUnit(input)
        {
            return new Decimal(input).times(new Decimal('100000000')).toFixed(0, Decimal.ROUND_HALF_DOWN);
        }

        // Shortcut for dynamic page loading function
        function loadPage(page, link = null, params = null, callback = null) {
            desk.nav.loadPage(page, link, params, false, callback);
        }

        // ------- Encryption/Decryption For Call Data -------

        async function encryptData(data, type) {
            if (!encryptionKey) throw new Error("Encryption key not set.");
            const iv = crypto.getRandomValues(new Uint8Array(12));
            
            // Convert Float32Array to ArrayBuffer if needed
            let dataToEncrypt;
            if (data instanceof Float32Array) {
                dataToEncrypt = data.buffer;
            } else {
                dataToEncrypt = data;
            }
            
            const encryptedData = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encryptionKey, dataToEncrypt);
            return { encryptedData, iv, type };
        }

        async function decryptData(encryptedData, iv) {
            if (!encryptionKey) throw new Error("Encryption key not set.");
            try {
                const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, encryptionKey, encryptedData);
                return new Uint8Array(decrypted);
            } catch (error) {
                console.error("Decryption failed:", error);
                throw error;
            }
        }

        
        // ------- File Encryption/Decryption -------
    
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

        // Add this function
        async function copyToClipboard(elementId, button) {
            const text = document.getElementById(elementId).textContent;
            try {
                await navigator.clipboard.writeText(text);
                button.classList.add('copied');
                button.innerHTML = '<i class="fas fa-check"></i>';
                
                // Show success state briefly
                setTimeout(() => {
                    button.classList.remove('copied');
                    button.innerHTML = '<i class="fas fa-copy"></i>';
                }, 2000);
                
                // Optional: Show a notification
                DeskNotifier.show({
                    title: 'Copied',
                    message: 'Text copied to clipboard',
                    type: 'success',
                    duration: 2000
                });
            } catch (err) {
                console.error('Failed to copy text: ', err);
                DeskNotifier.show({
                    title: 'Error',
                    message: 'Failed to copy text',
                    type: 'error'
                });
            }
        }