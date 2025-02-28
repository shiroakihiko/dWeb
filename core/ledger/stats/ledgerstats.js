const Decimal = require('decimal.js');

class LedgerStats {
    constructor(ledger) {
        this.ledger = ledger;
    }

    async initialize()
    {
        this.stats = await this.ledger.storage.openDB({ name: 'stats' });
    }

    async inc(key, amount) {
        let currentValue = this.stats.get(key);
        currentValue = currentValue ? currentValue : 0;

        let newValue = new Decimal(currentValue).add(amount).toFixed();
        await this.stats.put(key, newValue);
    }

    async dec(key, amount) {
        let currentValue = this.stats.get(key);
        currentValue = currentValue ? currentValue : 0;

        let newValue = new Decimal(currentValue).sub(amount).toFixed();
        await this.stats.put(key, newValue);
    }

    get(key) {
        return this.stats.get(key);
    }

    async set(key, value) {
        await this.stats.put(key, value);
    }
}

module.exports = LedgerStats;
