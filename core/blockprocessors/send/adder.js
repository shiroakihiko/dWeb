const BaseBlockAdder = require('../base/baseadder');

class SendBlockAdder extends BaseBlockAdder {
    constructor(network, validator) {
        super(network, validator);
    }
    
    // Uses default processAccounts and updateStats from base class
}

module.exports = SendBlockAdder;
