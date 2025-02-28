const ActionHelper = require('../../utils/actionhelper.js');

class Action {
    constructor(data) {
        this.lastSeenBlockHash = data.lastSeenBlockHash;
        this.timestamp = data.timestamp || null; // Set by node, not used in hashing
        this.account = data.account;
        this.nonce = data.nonce || 0; // NEW: Account's current nonce
        this.instruction = data.instruction;
        this.signatures = data.signatures;
        this.delegator = data.delegator; // ???
        this.hash = null;
    }

    async generateHash() {
        this.hash = await ActionHelper.generateHash(this);
    }
}

module.exports = Action;