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
        await this.stats.transaction(async () => {
            let currentValue = await this.stats.get(key);
            currentValue = currentValue ? JSON.parse(currentValue) : 0;

            let newValue = new Decimal(currentValue).add(amount).toFixed();
            await this.stats.put(key, JSON.stringify(newValue));
        });
    }

    async dec(key, amount) {
        await this.stats.transaction(async () => {
            let currentValue = await this.stats.get(key);
            currentValue = currentValue ? JSON.parse(currentValue) : 0;

            let newValue = new Decimal(currentValue).sub(amount).toFixed();
            await this.stats.put(key, JSON.stringify(newValue));
        });
    }

    async get(key) {
        return await this.stats.get(key);
    }

    async set(key, value) {
        await this.stats.put(key, JSON.stringify(value));
    }
}

module.exports = LedgerStats;
