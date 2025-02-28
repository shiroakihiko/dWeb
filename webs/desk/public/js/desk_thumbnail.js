class DeskThumbnail {
    constructor() {
        this.thumbnailCache = new Map();
    }

    getThumbnailNetwork() {
        const networkId = desk.settings.get('networks.thumbnail');
        if (networkId && desk.availableNetworks[networkId]) {
            return networkId;
        }
        
        // Fallback to first thumbnail network found
        for (const [networkId, network] of Object.entries(desk.availableNetworks)) {
            if (network.name.webName === 'thumbnail') {
                return networkId;
            }
        }
        return null;
    }

    async getDefaultThumbnail(accountId) {
        // Check cache first
        if (this.thumbnailCache.has(accountId)) {
            return this.thumbnailCache.get(accountId);
        }

        const networkId = this.getThumbnailNetwork();
        if (!networkId) {
            console.error('No thumbnail network available');
            return null;
        }

        const result = await desk.networkRequest({ 
            networkId: networkId, 
            method: 'getDefaultThumbnail', 
            accountId: accountId 
        });

        if (result.success) {
            this.thumbnailCache.set(accountId, result.thumbnail);
            return result.thumbnail;
        }
        
        return null;
    }

    clearCache() {
        this.thumbnailCache.clear();
    }
}
