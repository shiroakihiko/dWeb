class DeskAuth {
    constructor() {
        this.minPasswordLength = 8;
    }

    // Main login method that handles all login types
    async login(credentials) {
        try {
            let privateKey;
            
            switch (credentials.type) {
                case 'private-key':
                    privateKey = credentials.privateKey;
                    break;
                    
                case 'mnemonic':
                    privateKey = this.getPrivateKeyFromMnemonic(credentials.mnemonic);
                    break;
                    
                case 'seed':
                    privateKey = await this.getPrivateKeyFromSeed(credentials.seed);
                    break;
                    
                case 'stored':
                    return await this.loginStoredAccount(credentials.publicKey, credentials.password);
                    
                default:
                    throw new Error('Invalid login type');
            }

            const publicKey = desk.wallet.derivePublicKey(privateKey);
            
            // Check if account exists
            const accounts = desk.storage.getAccounts();
            if (!accounts[publicKey]) {
                if (!credentials.password) {
                    throw new Error('Password required for new account');
                }
                
                if (!this.validatePassword(credentials.password)) {
                    throw new Error('Password must be at least 8 characters');
                }
                
                // Create new account data
                const accountData = {
                    privateKey,
                    settings: desk.settings.getDefaultSettings()
                };
                
                await desk.storage.saveAccount(publicKey, accountData, credentials.password);
            }
            
            return await this.loginStoredAccount(publicKey, credentials.password);
            
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    }

    // Helper method for stored account login
    async loginStoredAccount(publicKey, password) {
        const success = await desk.storage.updateCurrentAccount(publicKey, password);
        if (!success) {
            throw new Error('Invalid password or account data');
        }

        const accountData = desk.storage.currentAccount.data;
        
        // Initialize wallet
        const validLogin = await desk.wallet.login(accountData.privateKey);
        if (!validLogin) {
            throw new Error('Invalid account data');
        }

        // Initialize settings
        desk.settings.settings = accountData.settings;
        
        return true;
    }

    // Validate password
    validatePassword(password) {
        return password && password.length >= this.minPasswordLength;
    }

    // Helper methods for different login types
    getPrivateKeyFromMnemonic(mnemonic) {
        const seed = desk.wallet.mnemonicToSeed(mnemonic);
        const keyPair = nacl.sign.keyPair.fromSeed(seed.slice(0, 32));
        return bufferToHex(keyPair.secretKey);
    }

    async getPrivateKeyFromSeed(seed) {
        const seedBytes = hexToUint8Array(seed);
        if (seedBytes.length !== 32) {
            throw new Error('Invalid seed length. ED25519 requires a 32-byte seed.');
        }
        const accounts = await desk.wallet.generateAccountsFromSeed(seedBytes);
        return accounts[0].privateKey;
    }
}