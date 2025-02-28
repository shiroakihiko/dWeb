class LedgerCacher {
    constructor(options = {}) {
        this.maxSize = options.maxSize || 1000;
        this.defaultTTL = options.ttl || 300000; // Default 5 minutes in milliseconds
        this.cache = new Map();
        this.accessOrder = new Map(); // For LRU tracking
        this.ttlMap = new Map(); // For TTL tracking
        this.accessCount = 0;

        // Start TTL cleanup interval
        this.cleanupInterval = setInterval(() => this.cleanExpired(), 60000); // Cleanup every minute
    }

    get(key) {
        if (!this.cache.has(key)) {
            return null;
        }

        // Check if expired
        if (this.isExpired(key)) {
            this.delete(key);
            return null;
        }

        // Update access tracking
        this.updateAccess(key);

        // Return deep copy to prevent reference issues
        return this.cache.get(key);
    }

    set(key, value, ttl = this.defaultTTL) {
        // Update cache
        this.cache.set(key, value);
        
        // Set expiration
        this.ttlMap.set(key, Date.now() + ttl);
        
        // Update access tracking
        this.updateAccess(key);

        // Evict oldest if we're over size
        this.evictIfNeeded();
    }

    isExpired(key) {
        const expirationTime = this.ttlMap.get(key);
        if (!expirationTime) return true;
        return Date.now() > expirationTime;
    }

    cleanExpired() {
        for (const [key] of this.cache) {
            if (this.isExpired(key)) {
                this.delete(key);
            }
        }
    }

    updateAccess(key) {
        this.accessCount++;
        this.accessOrder.set(key, this.accessCount);
    }

    evictIfNeeded() {
        if (this.cache.size <= this.maxSize) {
            return;
        }

        // Find least recently used item
        let oldestKey = null;
        let oldestAccess = Infinity;

        for (const [key, accessTime] of this.accessOrder) {
            if (accessTime < oldestAccess) {
                oldestAccess = accessTime;
                oldestKey = key;
            }
        }

        // Remove oldest
        if (oldestKey) {
            this.delete(oldestKey);
        }
    }

    clear() {
        this.cache.clear();
        this.accessOrder.clear();
        this.ttlMap.clear();
        this.accessCount = 0;
    }

    has(key) {
        if (!this.cache.has(key)) {
            return false;
        }
        
        // Check if expired
        if (this.isExpired(key)) {
            this.delete(key);
            return false;
        }
        
        return true;
    }

    delete(key) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
        this.ttlMap.delete(key);
    }

    size() {
        return this.cache.size;
    }

    destroy() {
        clearInterval(this.cleanupInterval);
        this.clear();
    }
}

module.exports = LedgerCacher; 