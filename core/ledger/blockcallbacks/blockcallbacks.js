const Decimal = require('decimal.js');

class LedgerBlockCallbacks {
    constructor(ledger) {
        this.blockcallbacks = ledger.db.openDB({ name: 'blockcallbacks', create: true });  // Block callbacks
        this.defaultKey = 'all'; // We just store an array of block hashes that need a callback
    }

    addCallback(blockHash)
    {
        this.blockcallbacks.transaction(() => {
            let callbacks = this.blockcallbacks.get(this.defaultKey);
            
            if(!callbacks)
                callbacks = [blockHash];
            else
                callbacks.push(blockHash);
            
            this.blockcallbacks.put(this.defaultKey, callbacks); // Store updated value
        });
    }

    removeCallback(blockHash)
    {
        this.blockcallbacks.transaction(() => {
            const callbacks = this.blockcallbacks.get(this.defaultKey);
            const updatedArray = callbacks.filter(item => item !== blockHash);
            return this.blockcallbacks.put(this.defaultKey, updatedArray);
        });
    }
    
    getAllCallbacks()
    {
        const callbacks = this.blockcallbacks.get(this.defaultKey);
        return callbacks ? callbacks : [];
    }
}

module.exports = LedgerBlockCallbacks;
