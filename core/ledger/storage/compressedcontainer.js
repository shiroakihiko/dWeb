const PropertyCompressor = require('./propertycompressor');

/**
 * Wrapper for storage containers that adds compression
 */
class CompressedContainer {
    constructor(container) {
        this.container = container;
        this.compressor = new PropertyCompressor();
    }

    get(key) {
        const value = this.container.get(key);
        if (!value) return null;
        return this.compressor.decompress(value);
    }

    async put(key, value) {
        const compressed = this.compressor.compress(value);
        return this.container.put(key, compressed);
    }

    async delete(key) {
        return this.container.delete(key);
    }

    getRange(options) {
        const results = this.container.getRange(options);
        return results.map(item => ({
            key: item.key,
            value: this.compressor.decompress(item.value)
        }));
    }

    getCount() {
        return this.container.getCount();
    }

    async transaction(fn) {
        return this.container.transaction(fn);
    }
}

module.exports = CompressedContainer; 