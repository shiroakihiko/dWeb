class DeskWallet
{
    constructor() {
        this.wordList = [];
        this.loadWordList();
        
        // Login management can be moved into it's own class later..
        this.publicKey = null;
        this.privateKey = null;
    }
    
    // ------------- Login
    async login(privateKey){
        if (!privateKey) {
            alert('Private key is required!');
            return false;
        }

        this.publicKey = this.derivePublicKey(privateKey);
        this.privateKey = privateKey;
        return true;
    }
    
    
    // ------------- Account Generation
    
    // Generate multiple accounts with ED25519 keys (private & public key pair) from a given seed
    async generateAccountsFromSeed(seed, numAccounts = 3) {
        // Convert the seed to a Uint8Array
        const seedArray = seed;

        // Create an array to store generated accounts
        const accounts = [];

        // Generate accounts using the seed and index
        for (let i = 0; i < numAccounts; i++) {
            // Prepare the index as a 4-byte Uint8Array (big-endian)
            const indexArray = new Uint8Array(4);
            indexArray[0] = (i >> 24) & 0xFF;
            indexArray[1] = (i >> 16) & 0xFF;
            indexArray[2] = (i >> 8) & 0xFF;
            indexArray[3] = i & 0xFF;

            // Concatenate the seed and index to create the input for Blake2b
            const inputArray = new Uint8Array(seedArray.length + indexArray.length);
            inputArray.set(seedArray, 0);
            inputArray.set(indexArray, seedArray.length);

            hasher.init();
            hasher.update(buffer);
            const privateKey = hasher.digest();
            /*
            let context = blake2bInit(32, null);
            // Use Blake2b to hash the input (seed + index)
            const updatedArray = blake2bUpdate(context, inputArray);
            const privateKey = blake2bFinal(context);  // This will give us a 32-byte private key
            */
            // Generate the public key from the private key using NaCl
            const keyPair = nacl.sign.keyPair.fromSeed(privateKey);

            // Store the new account
            accounts.push({
                privateKey: bufferToHex(keyPair.secretKey),
                publicKey: bufferToHex(keyPair.publicKey)
            });
        }

        return accounts;
    }

    // Convert mnemonic phrase to seed
    mnemonicToSeed(mnemonic) {
        let seed = [];
        const hash = CryptoJS.SHA256(mnemonic).toString(CryptoJS.enc.Hex);

        for (let i = 0; i < hash.length; i += 2) {
            seed.push(parseInt(hash.substr(i, 2), 16));
        }
        return new Uint8Array(seed);
    }

    // Generate a custom mnemonic phrase using the loaded wordlist
    generateMnemonic() {
        if (this.wordList.length === 0) {
            alert("Word list is not loaded yet!");
            return;
        }
        let mnemonic = [];
        for (let i = 0; i < 12; i++) {
            const randomWord = this.wordList[Math.floor(Math.random() * this.wordList.length)];
            mnemonic.push(randomWord);
        }
        return mnemonic.join(' ');
    }

    // Load the word list from the file
    async loadWordList() {
        const response = await fetch('/desk/js/crypto/wordlist.txt');
        const text = await response.text();
        this.wordList = text.split("\n").map(word => word.trim());
    }
    
    
    // --------------- HELPER
    
    // Helper function to derive public key from private key using TweetNaCl (ED25519)
    derivePublicKey(privateKey) {
        const publicKey = nacl.sign.keyPair.fromSecretKey(hexToUint8Array(privateKey)).publicKey;
        return bufferToHex(publicKey);
    }
}