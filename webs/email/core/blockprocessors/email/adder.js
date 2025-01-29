const BaseBlockAdder = require('../../../../../core/blockprocessors/base/baseadder');

class EmailBlockAdder extends BaseBlockAdder {
    constructor(network, validator) {
        super(network, validator);
    }
}

module.exports = EmailBlockAdder;
