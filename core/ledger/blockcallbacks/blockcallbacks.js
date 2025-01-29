const Decimal = require('decimal.js');

class LedgerBlockCallbacks {
    constructor(ledger) {
        this.ledger = ledger;
    }

    async initialize()
    {
        this.blockcallbacks = await this.ledger.storage.openDB({ name: 'blockcallbacks' });
        this.defaultKey = 'all';
    }

    async addCallback(blockHash) {
        await this.blockcallbacks.transaction(async () => {
            let callbacks = await this.blockcallbacks.get(this.defaultKey);
            
            if (!callbacks) {
                callbacks = [blockHash];
            } else {
                callbacks = JSON.parse(callbacks);
                callbacks.push(blockHash);
            }
            
            await this.blockcallbacks.put(this.defaultKey, JSON.stringify(callbacks));
        });
    }

    async removeCallback(blockHash) {
        await this.blockcallbacks.transaction(async () => {
            let callbacks = await this.blockcallbacks.get(this.defaultKey);
            if (!callbacks) return;

            callbacks = JSON.parse(callbacks);
            const updatedArray = callbacks.filter(item => item !== blockHash);
            await this.blockcallbacks.put(this.defaultKey, JSON.stringify(updatedArray));
        });
    }
    
    async getAllCallbacks() {
        const callbacks = await this.blockcallbacks.get(this.defaultKey);
        return callbacks ? JSON.parse(callbacks) : [];
    }
}

module.exports = LedgerBlockCallbacks;
