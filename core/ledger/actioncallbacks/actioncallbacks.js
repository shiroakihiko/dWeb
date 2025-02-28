class LedgerActionCallbacks {
    constructor(ledger) {
        this.ledger = ledger;
    }

    async initialize()
    {
        this.actioncallbacks = await this.ledger.storage.openDB({ name: 'actioncallbacks' });
        this.defaultKey = 'all';
    }

    async addCallback(actionHash, type) {
        let callbacks = this.actioncallbacks.get(this.defaultKey);
        const newCallback = {
            actionHash: actionHash,
            type: type,
            timestamp: Date.now()
        };

        if (!callbacks) {
            callbacks = [newCallback];
        } else {
            callbacks.push(newCallback);
        }
        
        await this.actioncallbacks.put(this.defaultKey, callbacks);
    }

    async removeCallback(actionHash) {
        await this.actioncallbacks.transaction(async () => {
            let callbacks = this.actioncallbacks.get(this.defaultKey);
            if (!callbacks) return;

            const updatedArray = callbacks.filter(item => item.actionHash !== actionHash);
            await this.actioncallbacks.put(this.defaultKey, updatedArray);
        });
    }
    
    getAllCallbacks() {
        const callbacks = this.actioncallbacks.get(this.defaultKey);
        if(!callbacks)
            return [];

        const actions = [];
        for (const callback of callbacks) {
            const action = this.ledger.getAction(callback.actionHash);
            if (action) actions.push(action);
        }
        return actions;
    }
}

module.exports = LedgerActionCallbacks;
