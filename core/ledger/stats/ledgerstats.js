const Decimal = require('decimal.js');

class LedgerStats {
    constructor(ledger) {
        this.stats = ledger.db.openDB({ name: 'stats', create: true });  // Statistics
    }

    inc(key, amount)
    {
        this.stats.transaction(() => {
            let currentValue = this.stats.get(key);
            currentValue = currentValue ? JSON.parse(currentValue) : 0;

            let newValue = new Decimal(currentValue).add(amount).toFixed();
            this.stats.put(key, newValue); // Store updated value
        });
    }

    get(key)
    {
        return this.stats.get(key);
    }
}

module.exports = LedgerStats;
