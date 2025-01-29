class DeskSettings {
    constructor() {
        this.settings = null;
    }

    getDefaultSettings() {
        return {
            theme: 'light',
            language: 'en',
            networks: {
                name: this.getFirstNetworkByType('name'),
                thumbnail: this.getFirstNetworkByType('thumbnail')
            },
            notifications: {
                sound: true,
                desktop: true,
                email: false
            },
            display: {
                compactView: false,
                showBalance: true
            },
            customization: {
                menuItems: [],
                shortcuts: {}
            }
        };
    }

    getFirstNetworkByType(webName) {
        if (!desk.availableNetworks) return null;
        
        for (const [networkId, network] of Object.entries(desk.availableNetworks)) {
            if (network.name.webName === webName) {
                return networkId;
            }
        }
        return null;
    }

    // Get a specific setting
    get(path) {
        return this.getNestedValue(this.settings, path);
    }

    // Set a specific setting
    async set(path, value) {
        if (!desk.storage.currentAccount) return false;
        
        this.setNestedValue(this.settings, path, value);
        desk.storage.currentAccount.data.settings = this.settings;
        return await desk.storage.saveCurrentAccount();
    }

    // Helper function to get nested value using dot notation
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => 
            current && current[key] !== undefined ? current[key] : null, obj);
    }

    // Helper function to set nested value using dot notation
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const lastObj = keys.reduce((current, key) => {
            if (!(key in current)) current[key] = {};
            return current[key];
        }, obj);
        lastObj[lastKey] = value;
    }
}
