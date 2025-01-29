class DeskStorage {
    constructor() {
        this.storageKey = 'desk_accounts';
        this.currentAccount = null;
    }

    // Get all stored accounts (only public keys and metadata)
    getAccounts() {
        const accounts = localStorage.getItem(this.storageKey);
        return accounts ? JSON.parse(accounts) : {};
    }

    // Save an account with all its encrypted data
    async saveAccount(publicKey, accountData, password) {
        const accounts = this.getAccounts();
        const encryptedData = await this.encryptData(JSON.stringify(accountData), password);
        
        accounts[publicKey] = {
            encryptedData,
            lastAccessed: Date.now()
        };
        
        localStorage.setItem(this.storageKey, JSON.stringify(accounts));
    }

    // Get decrypted account data
    async getAccountData(publicKey, password) {
        const accounts = this.getAccounts();
        if (!accounts[publicKey]) return null;
        
        try {
            const decryptedData = await this.decryptData(accounts[publicKey].encryptedData, password);
            return JSON.parse(decryptedData);
        } catch (e) {
            console.error('Failed to decrypt account data:', e);
            return null;
        }
    }

    // Update current account data
    async updateCurrentAccount(publicKey, password) {
        const accountData = await this.getAccountData(publicKey, password);
        if (!accountData) return false;
        
        this.currentAccount = {
            publicKey,
            password,
            data: accountData
        };
        return true;
    }

    // Save current account changes
    async saveCurrentAccount() {
        if (!this.currentAccount) return false;
        
        await this.saveAccount(
            this.currentAccount.publicKey,
            this.currentAccount.data,
            this.currentAccount.password
        );
        return true;
    }

    // Delete an account
    deleteAccount(publicKey) {
        const accounts = this.getAccounts();
        delete accounts[publicKey];
        localStorage.setItem(this.storageKey, JSON.stringify(accounts));
        
        if (this.currentAccount?.publicKey === publicKey) {
            this.currentAccount = null;
        }
    }

    // Encrypt data using password
    async encryptData(data, password) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await this.deriveKey(password, salt);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        const encoder = new TextEncoder();
        const encodedData = encoder.encode(data);
        
        const encryptedData = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encodedData
        );

        const result = {
            salt: Array.from(salt),
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(encryptedData))
        };

        return JSON.stringify(result);
    }

    // Decrypt data using password
    async decryptData(encryptedData, password) {
        const { salt, iv, data } = JSON.parse(encryptedData);
        const key = await this.deriveKey(password, new Uint8Array(salt));
        
        const decryptedData = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(iv) },
            key,
            new Uint8Array(data)
        );

        const decoder = new TextDecoder();
        return decoder.decode(decryptedData);
    }

    // Derive encryption key from password
    async deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);
        
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            passwordBuffer,
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }
}