const nacl = require('tweetnacl');
const fs = require('fs');
const Hasher = require('../utils/hasher.js');

class Wallet {
    constructor(walletFilePath = null, seed = null) {
        this.walletFilePath = walletFilePath;
        this.accounts = [];
        this.seed = seed;
    }

    async initialize() {
        // Load wallet if it exists, otherwise generate a new one
        if (fs.existsSync(this.walletFilePath)) {
            this.loadWallet();
        } else {
            if (this.seed) {
                console.log('Generating wallet from provided seed...');
                await this.generateAccountsFromSeed(this.seed);  // Generate multiple accounts from the seed
            } else {
                console.log('Wallet file not found. Generating new wallet...');
                await this.generateSeed(); // Generate a new seed and wallet if no seed is provided
            }
        }
    }
    // Generate a new random seed for the wallet
    async generateSeed() {
        // Generate a random seed using crypto.randomBytes (32 bytes => 256 bits)
        this.seed = Hasher.randomHash(32);
        console.log('Generated Seed:', this.seed);

        // Generate multiple accounts from the seed
        await this.generateAccountsFromSeed(this.seed);
    }

    // Generate multiple accounts with Ed25519 keys (private & public key pair) from a given seed
    async generateAccountsFromSeed(seed, numAccounts = 3) {
        // Convert the seed to a Buffer
        const seedBuffer = Buffer.from(seed, 'hex');

        // Start generating accounts from the current length of the accounts array
        const startIndex = this.accounts.length;

        // Generate the new accounts starting from the current account length
        for (let i = startIndex; i < startIndex + numAccounts; i++) {
            // Prepare the index as a 4-byte Buffer (big-endian)
            const indexBuffer = Buffer.alloc(4);
            indexBuffer.writeUInt32BE(i, 0);  // Encode the index as a 4-byte big-endian buffer

            // Concatenate the seed and the index to create the input for Blake2b
            const inputBuffer = Buffer.concat([seedBuffer, indexBuffer]);

            // Use Blake2b to hash the input (seed + index)
            const privateKey = await Hasher.hashBuffer(inputBuffer, 32, null); // Todo: Check if this is still working correctly

            // Generate the public key from the private key using NaCl
            const keyPair = nacl.sign.keyPair.fromSeed(privateKey);

            // Store the new account
            const account = {
                privateKey: keyPair.secretKey,
                    publicKey: keyPair.publicKey
            };
            this.accounts.push(account);
        }

        // Save the wallet after generating the accounts
        if (this.walletFilePath) {
            this.saveWallet(this.walletFilePath);
        }
    }

    // Get the public address from an account's public key (hex format)
    getPublicAddress(account) {
        return Buffer.from(account.publicKey).toString('hex');  // Convert public key to hex string
    }

    // Get the private key from a public address
    getPrivateKeyForAccount(publicAddress) {
        // Iterate over the accounts to find the one matching the public address
        for (const account of this.accounts) {
            const address = this.getPublicAddress(account);
            if (address === publicAddress) {
                return account.privateKey;  // Return the private key if address matches
            }
        }
        return false;
    }

    // Save the entire wallet (accounts) and seed to a file
    saveWallet(walletFilePath) {
        const walletData = this.accounts.map(account => ({
            privateKey: Buffer.from(account.privateKey).toString('hex'),  // Convert private key buffer to hex string
                publicKey: Buffer.from(account.publicKey).toString('hex')    // Convert public key buffer to hex string
        }));

        // Save the wallet data as a JSON string, including the seed
        const walletWithSeed = {
            seed: this.seed,    // Save the seed used for generating the wallet
            accounts: walletData
        };

        // Save the wallet data as a JSON string
        fs.writeFileSync(walletFilePath, JSON.stringify(walletWithSeed, null, 2));  // Pretty-print JSON
    }

    // Load the wallet from a file
    loadWallet() {
        const walletData = JSON.parse(fs.readFileSync(this.walletFilePath, 'utf-8'));
        this.seed = walletData.seed;  // Load the seed from the file
        this.accounts = walletData.accounts.map(account => {
            return {
                privateKey: Buffer.from(account.privateKey, 'hex'),  // Convert hex string back to Buffer
                publicKey: Buffer.from(account.publicKey, 'hex')     // Convert hex string back to Buffer
            };
        });
    }

    // Sign a message using the account's private key
    signTransaction(accountIndex, data) {
        const privateKey = this.accounts[accountIndex].privateKey;
        const message = Buffer.from(data);
        const signature = nacl.sign.detached(message, privateKey);
        return signature;
    }

    // Verify a signature using the account's public key
    verifyTransaction(accountIndex, data, signature) {
        const publicKey = this.accounts[accountIndex].publicKey;
        const message = Buffer.from(data);
        return nacl.sign.detached.verify(message, signature, publicKey);
    }

    // Get a list of all public keys (accounts)
    getPublicKeys() {
        return this.accounts.map(account => this.getPublicAddress(account));  // Use hex format for addresses
    }

    // Get all accounts
    getAccounts() {
        return this.accounts;
    }

    // Get the seed for wallet generation
    getSeed() {
        return this.seed;  // Return the seed for recreating the wallet
    }
}

module.exports = Wallet;
