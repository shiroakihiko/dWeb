

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
            const encoder = new TextEncoder();
            const messageBytes = encoder.encode(message);
            return nacl.sign.detached(messageBytes, hexToUint8Array(desk.wallet.privateKey));
        }

        // Verify the signature
        async function verifySignature(data, signature, senderPublicKey) {
            const encoder = new TextEncoder();
            const messageBytes = encoder.encode(data);
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

        // Utility functions for encryption/decryption
        async function hashText(text) {
            return await CryptoJS.SHA256(text).toString(CryptoJS.enc.Hex);
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
        function loadPage(page, link = null, params = null) {
            desk.nav.loadPage(page, link, params);
        }